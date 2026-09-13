import './globals.css';
import type {Metadata,Viewport} from 'next';
export const metadata:Metadata={title:'ExPress — Your everyday wallet',description:'ExPress オンラインウォレット・決済プラットフォーム デモ',manifest:'/manifest.webmanifest',applicationName:'ExPress',icons:{icon:[{url:'/icon-192.png',sizes:'192x192',type:'image/png'},{url:'/logo.svg',type:'image/svg+xml'}],apple:[{url:'/apple-touch-icon.png',sizes:'180x180'}]},appleWebApp:{capable:true,title:'ExPress',statusBarStyle:'default'}};
export const viewport:Viewport={themeColor:'#153f52',width:'device-width',initialScale:1};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja" suppressHydrationWarning><body>{children}</body></html>;}
