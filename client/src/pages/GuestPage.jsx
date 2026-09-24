import { useState } from 'react';
import { Music } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
export default function GuestPage() {
 const [mode,setMode]=useState('login');
 const [username,setUsername]=useState('');
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const {authenticate}=useAuth();
 async function submit(event){event.preventDefault();setError('');if(mode==='register'&&password!==confirm){setError('Hai mật khẩu chưa khớp.');return;}setBusy(true);try{await authenticate(mode,username.trim(),password);}catch(err){setError(err.response?.data?.error||'Không thể kết nối. Vui lòng thử lại.');}finally{setBusy(false);}}
 const input='mt-2 w-full rounded-lg border border-dark-400 bg-dark-600 px-4 py-2.5 text-white focus:outline-none focus:border-primary-400';
 return <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4 py-10"><div className="w-full max-w-md">
  <div className="text-center mb-7"><Music className="mx-auto mb-3 text-primary-400" size={40}/><h1 className="text-2xl font-bold text-white">YouTube Music Together</h1></div>
  <form onSubmit={submit} className="rounded-2xl border border-dark-500 bg-dark-700 p-6">
   <div className="mb-6 grid grid-cols-2 gap-2">{[['login','Đăng nhập'],['register','Tạo tài khoản']].map(([key,label])=><button key={key} type="button" disabled={busy} onClick={()=>{setMode(key);setError('');setPassword('');setConfirm('');}} className={`rounded-lg py-2 text-sm font-medium ${mode===key?'bg-primary-600 text-white':'bg-dark-600 text-dark-100'}`}>{label}</button>)}</div>
   {error&&<p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
   <label className="block text-sm text-dark-100">Tên hồ sơ<input className={input} autoComplete="username" required maxLength={30} value={username} onChange={e=>setUsername(e.target.value)}/></label>
   <label className="mt-4 block text-sm text-dark-100">Mật khẩu<input className={input} type="password" autoComplete={mode==='register'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {mode==='register'&&<label className="mt-4 block text-sm text-dark-100">Nhập lại mật khẩu<input className={input} type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
   <button disabled={busy} className="mt-6 w-full rounded-lg bg-primary-600 py-2.5 font-medium text-white disabled:opacity-50">{busy?'Đang xử lý…':mode==='register'?'Tạo tài khoản':'Đăng nhập'}</button>
  </form>
 </div></div>;
}
