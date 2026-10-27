import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const readJson=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
const summary=readJson('evidence/tests/summary.json');
const rows=fs.existsSync('evidence/tests/results.tsv') ? fs.readFileSync('evidence/tests/results.tsv','utf8').trim().split('\n').filter(Boolean) : [];
const checks=rows.map(line=>{const [id,raw]=line.split('\t');const exitCode=Number(raw);return {id,status:exitCode===0?'passed':'failed',exitCode,evidence:'tests/stdout.txt'};});
if(!rows.length) checks.push({id:'logic-regression',status:'not_run',exitCode:null,evidence:null});
checks.push({id:'browser-acceptance',status:'not_run',required:false,reason:'Executed by separate SOL SKATE gameplay acceptance workflow',exitCode:null,evidence:null});
const checkSummary={expected:23,observed:rows.length,passed:checks.filter(c=>c.id!=='browser-acceptance'&&c.status==='passed').length,failed:checks.filter(c=>c.id!=='browser-acceptance'&&c.status==='failed').length,notRun:checks.filter(c=>c.id!=='browser-acceptance'&&c.status==='not_run').length};
const ok=process.env.TEST_OUTCOME==='success' && summary?.logicExitCode===0 && rows.length===23 && checks.every(c=>c.status!=='failed');
const files=[];
for(const path of ['tested-commit.txt','tests/stdout.txt','tests/stderr.txt','tests/results.tsv','tests/summary.json']){
 const full='evidence/'+path;
 if(fs.existsSync(full)) files.push({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')});
}
const report={
 schema:'sol-skate-evidence/v1.1',
 assignmentId:process.env.ASSIGNMENT_ID || 'unspecified',
 repository:'jonmbehrends-cmd/Skate-2',
 revision:{prHead:process.env.PR_HEAD_SHA||null,testedCheckout:sha,base:process.env.BASE_SHA||null},
 trigger:process.env.EVENT_NAME||'unknown',
 runId:process.env.RUN_ID||'',
 runAttempt:process.env.RUN_ATTEMPT||'',
 checks,
 checkSummary,
 files,
 limitations:['Browser rendering, physical device controls, and gameplay feel not verified by this collector.'],
 overallStatus:ok?'passed':'failed',
 readyForReview:ok
};
fs.mkdirSync('evidence',{recursive:true});
fs.writeFileSync('evidence/handoff.json',JSON.stringify(report,null,2)+'\n');
