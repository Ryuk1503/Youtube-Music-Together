import axios from 'axios';
const api = axios.create({ baseURL:'/api', withCredentials:true, headers:{'X-YTM-Request':'1'} });
api.interceptors.response.use(response=>response,error=>{
  if(error.response?.status===401 && !['/auth/login','/auth/register','/auth/me'].includes(error.config?.url))window.dispatchEvent(new Event('session-expired'));
  return Promise.reject(error);
});
export default api;
