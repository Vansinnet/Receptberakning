import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-serif/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/print.css';
import { mount } from 'svelte';
import App from './components/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('[main.ts] #app saknas i DOM — kontrollera index.html');

export default mount(App, { target });
