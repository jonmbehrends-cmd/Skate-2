import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const readJson = p => {try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
const summary=readJson('evidence/tests/summary.json');
const ok=process.env.TEST_OUTCOME==='success' && summary?.logicExitCode===0;
const report={
 schema:'sol-skate-evidence/v1',
 assignmentId:process.env.ASSIGNMENT_ID || 'unspecified',
 commit:sha,
 runId:process.env.RUN_ID || '',
 runAttempt:process.env.RUN_ATTEMPT || '',
 checks:[{name:'logic-regression',status:ok?'passed':'failed-or-incomplete'}],
 artifacts:['evidence/tests/stdout.txt','evidence/tests/stderr.txt','evidence/tests/summary.json','evidence/tested-commit.txt'],
 limitations:['Browser rendering, actual device controls, and gameplay feel not verified by this collector.'],
 readyForReview:ok
};
fs.mkdirSync('evidence',{recursive:true});
fs.writeFileSync('evidence/handoff.json',JSON.stringify(report,null,2)+'\n');
