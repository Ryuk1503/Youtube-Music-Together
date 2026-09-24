import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
const AuthContext=createContext(null);
export function AuthProvider({children}) {
 const [user,setUser]=useState(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  localStorage.removeItem('token');localStorage.removeItem('user');
  let active=true;
  api.get('/auth/me').then(({data})=>{if(active)setUser(data.user);}).catch(()=>{}).finally(()=>{if(active)setLoading(false);});
  const expired=()=>setUser(null);
  window.addEventListener('session-expired',expired);
  return()=>{active=false;window.removeEventListener('session-expired',expired);};
 },[]);
 const authenticate=async(mode,username,password)=>{const {data}=await api.post('/auth/'+mode,{username,password});setUser(data.user);return data.user;};
 const logout=async()=>{try{await api.post('/auth/logout');setUser(null);}catch(error){if(error.response?.status===401)setUser(null);else window.alert('Chưa đăng xuất được. Vui lòng thử lại.');}};
 const changePassword=async(password,currentPassword)=>{const {data}=await api.post('/auth/password',{password,currentPassword});setUser(data.user);window.dispatchEvent(new Event('session-renewed'));};
 return <AuthContext.Provider value={{user,loading,authenticate,logout,changePassword,updateUser:setUser}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
