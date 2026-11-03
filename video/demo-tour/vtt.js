const fs=require('fs');global.window={};global.document={querySelector:()=>({style:{}}),createElement:()=>({style:{},appendChild(){}}),};
const src=fs.readFileSync(__dirname+'/timeline.js','utf8');const m=src.match(/const CAPS = (\[[\s\S]*?\]\]);\nwindow\.CAPS/);
const CAPS=eval(m[1]);const f=s=>{const h=Math.floor(s/3600),mi=Math.floor(s%3600/60),se=(s%60).toFixed(3).padStart(6,'0');return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${se}`};
fs.writeFileSync('captions.vtt','WEBVTT\n\n'+CAPS.map((c,i)=>`${i+1}\n${f(c[0])} --> ${f(c[1])}\n${c[2]}\n`).join('\n'));
