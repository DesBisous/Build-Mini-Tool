const fs = require('fs');
const path = require('path');
const Koa = require('koa');
const compilerSfc = require('@vue/compiler-sfc');
const compilerDom = require('@vue/compiler-dom');

const app = new Koa();

function rewriteImport(content) {
  // s0 为匹配到的所有值，s1 为匹配到 ([^'"]+) 的内容
  return content.replace(/ from ['|"]([^'"]+)['|"]/g, function (s0, s1) {
    // . ../ / 开头的都是相对路径
    if (s1[0] !== '.' && s1[1] !== '/') {
      /**
       * 针对引入第三方库的情况，from 'vue',
       * 全部转换成 from '/@modules/vue' 标识需要从 node_modual 库中获取
       */
      return `from '/@modules/${s1}'`;
    } else {
      return s0;
    }
  })
}

app.use(async ctx => {
  const { request: { url, query } } = ctx;

  if (url === '/') {
    ctx.type = 'text/html';
    let content = fs.readFileSync('./index.html', 'utf-8'); // 这里如果不用 utf-8 那会返回 Buffer 类型
    content = content.replace(`<script `, `
      <script>
        window.process = { env: { NODE_ENV: 'dev' } }; // 这是所需要的全局环境变量
      </script>
      <script 
    `);
    ctx.body = content;
  } else if (url.endsWith('.js')) {
    // js 文件
    const p = path.resolve(__dirname, url.slice(1)); // '/aa/bb'.slice(1) 得到的是相对路径 'aa/bb'
    ctx.type = 'application/javascript';
    const content = fs.readFileSync(p, 'utf-8');
    ctx.body = rewriteImport(content);
  } else if(url.startsWith('/@modules/')) { // 这里是解析用过 rewriteImport 处理后，再次发起请求的文件进行解析
    // 这是一个 node_module 里的东西，以下用 vue 举例
    const prefix = path.resolve(__dirname, 'node_modules', url.replace('/@modules/', '')); // 获取 vue 位置
    const module = require(prefix + '/package.json').module; // 获取 vue 实际入口文件地址
    const p = path.resolve(prefix, module); // 获取 vue 实际入口文件
    const content = fs.readFileSync(p, 'utf-8'); // 读取 Vue 内容
    ctx.type = 'application/javascript';
    ctx.body = rewriteImport(content); // 再次检查并且解析里面的 import 语法
  } else if (url.indexOf('.vue') > -1) {
    // vue 单文件组件
    const p = path.resolve(__dirname, url.split('?')[0].slice(1)); // /aa/bb.vue?type=template => aa/bb.vue
    const { descriptor } = compilerSfc.parse(fs.readFileSync(p, 'utf-8')); // 使用 vue 库解析 .vue 文件，获取出包含 template 和 script 等等内容

    if (!query.type) {
      ctx.type = 'application/javascript';
      /**
       * 借用 vue 自家的 compile 框架，解析单文件组件，其实相当于 vue-loader 做的事情
       * descriptor.script.content 就是 .vue 文件写的 javascript
       */
      const script = descriptor.script ? descriptor.script.content : descriptor.scriptSetup.content;
      const __script = descriptor.script ?
        script.replace('export default ', 'const __script = ') :
        script.replace(/ from ['|"]([^'"]+)['|"]([\s\S]+)(?!import)\n\n/, function (s0) {
          return  `${s0} const __script = { setup() { `
        }) + 'return {count,add,double} } }';
      ctx.body = `
        /**
         * 这里把 export default 变成 const __script = 让 js 部分的内容暂存在 __script 变量中
         * 因为后续需要将 template 变成 render 函数放到 __script 变量中，然后一起 export default 导出给 Vue 使用
         */
        ${rewriteImport(__script)};
        import { render as __render } from '${url}?type=template'; // 模拟再次发起请求获取 template 内容
        __script.render = __render;
        export default __script;
      `;
    } else if (query.type === 'template') {
      // 模板内容
      const template = descriptor.template;
      /**
       * 要在 server 端把 compiler 做了，解析 templace 模式为 module 模式，
       * 这里的使用 module，是因为前面解析获取 vue 库的时候，也是从 package.json 中获取 mpdule 字段的路径
       */
      const render = compilerDom.compile(template.content, { mode: 'module' }).code;
      ctx.type = 'application/javascript';
      ctx.body = rewriteImport(render);
    }
  } else if (url.endsWith('.css')) {
    const p = path.resolve(__dirname, url.slice(1)); // "/aa/bb".slice(1) 得到的是相对路径 "aa/bb"
    const file = fs.readFileSync(p, 'utf-8');
    const content = `
      const css = '${file.replace(/\n/g, '')};'
      const link = document.createElement('style');
      link.setAttribute('type', 'text/css');
      document.head.appendChild(link);
      link.innerHTML = css;
      export default css; // 这里导出是为了避免在 from 这个文件的时候未能拿到东西而报错
    `;
    ctx.type = 'application/javascript';
    ctx.body = content;
  }
    
});

app.listen(3002, ()=>{
  console.log('听我口令，3002端口，起~~')
})