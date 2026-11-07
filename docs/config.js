// Paste your Apps Script web app URL here (it ends in /exec). See README step 2.
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJDaKnBY7LDWngqfY_Kwb1PObE3u6E-80FfnlWy8ZC_Ti1dQKl0DQW0nCY_13mmWdK/exec';

// When you run `npm run dev`, the site talks to a pretend sheet instead.
// Add ?live to the address (e.g. http://localhost:8080/?live) to use the real sheet locally.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (new URLSearchParams(location.search).has('live')) sessionStorage.setItem('live', '1');
export const API_URL = local && !sessionStorage.getItem('live') ? '/api' : APPS_SCRIPT_URL;
