const { randomBytes, createHash } = require('node:crypto');
const { pool } = require('../config/db');
const digest = value => createHash('sha256').update(value).digest('hex');
const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-ytm_session' : 'ytm_session';
const cookieOptions = () => ({ httpOnly:true, secure:process.env.NODE_ENV === 'production', sameSite:'lax', path:'/', maxAge:7*24*3600*1000 });
const publicUser = row => ({id:row.id,username:row.username,publicId:row.public_id,isAdmin:row.is_admin,hasPassword:true});
function allowedOrigin(origin) {
  if (!origin) return false;
  const allowed = [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean).map(value=>new URL(value).origin);
  if(process.env.NODE_ENV !== 'production') allowed.push('http://localhost:5173','http://localhost:5174','http://localhost:3001');
  return allowed.includes(origin);
}
function allowedSocketRequest(headers) {
  // Same-origin polling GETs omit Origin; browsers still send Fetch Metadata.
  return headers.origin ? allowedOrigin(headers.origin) : headers['sec-fetch-site'] === 'same-origin';
}
function csrfGuard(req,res,next) {
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if(req.headers['x-ytm-request'] !== '1' || (req.headers.origin && !allowedOrigin(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({error:'Yêu cầu không hợp lệ.'});
  next();
}
function sessionToken(headers) {
  const name=cookieName()+'=';
  const value=String(headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length);
  return /^[a-f0-9]{64}$/.test(value||'') ? value : null;
}
async function resolveSession(headers) {
  const token=sessionToken(headers);if(!token)return null;
  const {rows}=await pool.query(`SELECT a.*,s.token_hash,s.expires_at FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(token)]);
  return rows[0]||null;
}
async function createSession(db,id) {
  const token=randomBytes(32).toString('hex');
  await db.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(token),id]);
  return token;
}
function setSession(res,token){res.cookie(cookieName(),token,cookieOptions());}
function clearSession(res){const {maxAge,...options}=cookieOptions();res.clearCookie(cookieName(),options);}
async function authenticateToken(req,res,next) {
  try {
    const account=await resolveSession(req.headers);
    if(!account)return res.status(401).json({error:'Vui lòng đăng nhập lại.'});
    req.account=account;req.user={userId:account.id,username:account.username,type:'account'};req.sessionHash=account.token_hash;
    res.set('Cache-Control','no-store');next();
  } catch {res.status(503).json({error:'Chưa kết nối được tài khoản. Vui lòng thử lại.'});}
}
function requireAdmin(req,res,next){if(!req.account?.is_admin)return res.status(403).json({error:'Chỉ quản trị viên được thực hiện thao tác này.'});next();}
async function limitAuth(req,res,next) {
  try {
    await pool.query('DELETE FROM account_auth_limits WHERE expires_at<now()');
    const keys=[['ip:'+req.ip,100]];
    if(typeof req.body?.username==='string')keys.push(['name:'+req.body.username.trim().normalize('NFKC').toLocaleLowerCase('vi'),20]);
    for(const [key,max] of keys){const {rows}=await pool.query(`INSERT INTO account_auth_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=account_auth_limits.attempts+1 RETURNING attempts`,[digest(key)]);if(rows[0].attempts>max)return res.status(429).json({error:'Bạn thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'});}
    next();
  }catch {res.status(503).json({error:'Chưa thể xác thực. Vui lòng thử lại.'});}
}
function disconnectAccount(io,id,exceptHash) {
  if(!io)return;
  for(const socket of io.sockets.sockets.values())if(socket.user?.userId===id && socket.sessionHash!==exceptHash)socket.disconnect(true);
}
module.exports={authenticateToken,requireAdmin,csrfGuard,allowedOrigin,allowedSocketRequest,resolveSession,createSession,setSession,clearSession,publicUser,limitAuth,disconnectAccount,digest};
