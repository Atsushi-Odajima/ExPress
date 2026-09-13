/**
 * Shell-safe curl examples for the API Playground.
 * The access token is never embedded: examples reference the EXW_ACCESS_TOKEN
 * environment variable, which each shell expands only inside double quotes.
 * Every visitor-controlled value (URL, idempotency key, JSON body) is quoted
 * literally so it cannot break out of the argument or run commands.
 */
export type PlaygroundMethod='GET'|'POST';
export interface CurlInput {method:PlaygroundMethod;url:string;idempotencyKey:string;body?:unknown;}
/** POSIX sh/bash/zsh: single quotes are literal; an embedded quote becomes '"'"'. */
export function posixQuote(value:string):string {return "'"+value.replace(/'/g,`'"'"'`)+"'";}
/**
 * Windows PowerShell / pwsh on Windows calling curl.exe: single quotes are literal and
 * doubled to escape. Double quotes inside the literal are escaped as \" so the native
 * argument parser keeps them (required by Windows PowerShell 5.1 and pwsh Legacy/Windows modes).
 */
export function powershellQuote(value:string):string {return "'"+value.replace(/'/g,"''").replace(/"/g,'\\"')+"'";}
export function curlExamples(input:CurlInput):{posix:string;powershell:string} {
 const json=input.method==='POST'?JSON.stringify(input.body??{}):undefined;
 const lines=(quote:(s:string)=>string,token:string,command:string)=>[
  `${command} -X ${input.method} ${quote(input.url)}`,
  `-H "Authorization: Bearer ${token}"`,
  `-H ${quote('Idempotency-Key: '+input.idempotencyKey)}`,
  ...(json===undefined?[]:[`-H ${quote('Content-Type: application/json')}`,`--data-binary ${quote(json)}`])
 ];
 return {
  posix:lines(posixQuote,'$EXW_ACCESS_TOKEN','curl').join(' \\\n  '),
  powershell:lines(powershellQuote,'$env:EXW_ACCESS_TOKEN','curl.exe').join(' `\n  ')
 };
}
