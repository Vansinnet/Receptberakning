import App from './components/App.svelte';
import { mount } from 'svelte';
import './app.css';
import './css/print.css';

const target = document.getElementById('app');
if (!target) throw new Error('[main.ts] #app saknas i DOM — kontrollera index.html');
const app = mount(App, { target });

export default app;
