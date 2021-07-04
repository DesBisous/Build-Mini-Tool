const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');
const prettier = require('prettier');

/**
 * 分析模块
 */
function getModuleInfo(file) {
  // 读取文件
  const body = fs.readFileSync(file, 'utf-8');

  // 转化 AST 语法树
  const ast = parser.parse(body, {
    sourceType: 'module', // 表示我们要解析的是 ES 模块
  });

  // 依赖收集
  const deps = {};
  traverse(ast, {
    // visitor 函数，解析 import 语法糖
    ImportDeclaration({ node }) {
      const dirname = path.dirname(file); // 获取文件目录
      const abspath = './' + path.join(dirname, node.source.value); // 拼接地址
      deps[node.source.value] = abspath;
    }
  });

  // ES6 转成 ES5
  const { code } = babel.transformFromAst(ast, null, {
    presets: ['@babel/preset-env']
  })

  const moduleInfo = { file, deps, code };
  return moduleInfo;
}

// console.log('getModuleInfo: ', getModuleInfo('./src/index.js'))

/**
 * 递归获取依赖
 */
function getDeps(temp, { deps }) {
  Object.keys(deps).forEach(key => {
    const child = getModuleInfo(deps[key]); // 使用依赖集合中的文件 value 去迭代
    temp.push(child);
    getDeps(temp, child);
  })
}

/**
 * 模块解析
 */
function parseModules(file) {
  const entry = getModuleInfo(file); // 获取入口文件的模块信息
  const temp = [entry]; // 收集所有文件的模块信息集合
  const depsGraph = {}; // 收集所有依赖的集合

  getDeps(temp, entry); // 从入口开始

  temp.forEach(moduleInfo => {
    depsGraph[moduleInfo.file] = {
      deps: moduleInfo.deps,
      code: moduleInfo.code
    }
  });

  return depsGraph;
}

// console.log('depsGraph: ', parseModules('./src/index.js'));

/**
 * 生成 bundle 文件
 */
function bundle(file) {
  const depsGraph = JSON.stringify(parseModules(file));
  return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
            }
            var exports = {};
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code)
            return exports
        }
        require('${file}')
    })(${depsGraph})`;
}
const content = bundle("./src/index.js");

// console.log(content);
const distPath = path.resolve(__dirname, `./dist`);
!fs.existsSync(distPath) && fs.mkdirSync(distPath);
const bundlePath = path.resolve(__dirname, `./dist/bundle.js`);
fs.writeFileSync(bundlePath, prettier.format(content, { parser: 'babel' }));
