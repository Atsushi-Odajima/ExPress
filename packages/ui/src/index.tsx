import type {ReactNode} from 'react';
import {tr} from './i18n';
export function Logo(){return <span className="logo"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="currentColor"/><path d="M12 11h19l-5 7H16l-4 5h15l-5 7H5l8-12H9z" fill="#90e2c7"/></svg><span>ExPress<span className="logo-dot">.</span></span></span>;}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:string}){return <span className={'badge '+tone}>{children}</span>;}
export function Empty({children}:{children?:ReactNode}){return <div className="empty"><span className="empty-ring">↗</span><p>{children??tr("まだデータがありません。")}</p></div>;}
export function Amount({value,className=''}:{value?:string;className?:string}){return <span className={className} aria-busy={value===undefined}>{value===undefined?'—':'¥'+BigInt(value).toLocaleString('ja-JP')}</span>;}
