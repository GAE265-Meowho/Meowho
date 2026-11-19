"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import WelfareApp from './WelfareApp';
/** Photo remains mounted so changing modes never discards its in-memory evidence or After. */
export default function ModeShell({children}:{children:React.ReactNode}){
 const video=usePathname()==='/video';
 return <><nav className="mode-nav" aria-label="環境健檢"><Link href="/photo" aria-current={!video?'page':undefined}>照片健檢</Link><Link href="/video" aria-current={video?'page':undefined}>影片健檢</Link></nav><div hidden={video}><WelfareApp/></div>{children}</>;
}
