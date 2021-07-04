<template>
  <div class="container">
    <h1>大家好 欢迎您</h1>
    <h2>
      <span>count is {{count}} * 2 = {{double}}</span>
      <button @click="count++">戳我</button>
    </h2>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const count = ref(6);
const add = () => { count.value++; };
const double = computed(() => count.value * 2);
</script>