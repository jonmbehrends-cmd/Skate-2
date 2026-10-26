// Parse the actual inline game source without requiring a browser or the Babylon CDN.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(x => x.trim());
assert.equal(scripts.length, 1, 'Expected exactly one inline game script');
for(const source of scripts) new vm.Script(source,{filename:'index.html:inline'});
assert(html.includes('src="controller.js"'), 'Controller module must load');
assert(html.includes('src="landing.js"'), 'Landing module must load');
assert(html.includes('src="terrain.js"'), 'Terrain module must load');
assert(html.includes('SOLTerrain.sample('), 'Terrain sampling must be integrated');
assert(html.includes('SOLTerrain.launch('), 'Lip launch must be integrated');
assert(html.indexOf('src="controller.js"') < html.indexOf('src="landing.js"'), 'Controller precedes landing module');
assert(html.includes('SOLLanding.canLand(state,state.flip,state.spin)'), 'Landing physics must be integrated');
assert(html.includes('legacy.html'), 'Legacy fallback must remain');
console.log('SOL SKATE inline game script and module wiring passed');
