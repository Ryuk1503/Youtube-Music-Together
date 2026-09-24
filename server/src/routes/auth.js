const express=require('express');
const {randomUUID}=require('node:crypto');
const {pool}=require('../config/db');
const {validPassword,hashPassword,verifyPassword}=require('../utils/passwords');
const {authenticateToken,createSession,setSession,clearSession,publicUser,limitAuth,disconnectAccount}=require('../middleware/auth');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const key=name=>name.normalize('NFKC').toLocaleLowerCase('vi');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/register',limitAuth,wrap(async(req,res)=>{
 const {username,password}=req.body;
 if(typeof username!=='string'||username.trim().length<1||username.trim().length>30||/[\p{Cc}\p{Cf}]/u.test(username)||!validPassword(password))return res.status(400).json({error:'Tên cần 1–30 ký tự; vui lòng nhập mật khẩu.'});
 const hash=await hashPassword(password);const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(73120412)');
  const publicId=(await db.query("SELECT 'ytmt-' || lpad(n::text,GREATEST(2,length(n::text)),'0') AS id FROM nextval('account_public_id_seq') n")).rows[0].id;
  const {rows}=await db.query('INSERT INTO accounts(id,username,name_key,password_hash,public_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),username.trim(),key(username.trim()),hash,publicId]);
  const account=rows[0];
  await db.query('INSERT INTO account_profiles(id,display_name) VALUES($1,$2)',[account.id,account.username]);
  await db.query("INSERT INTO account_events(account_id,event) VALUES($1,'registered')",[account.id]);
  const token=await createSession(db,account.id);
  await db.query('COMMIT');setSession(res,token);res.status(201).json({user:publicUser(account)});
 }catch(error){await db.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Tên này đã được sử dụng. Hãy chọn tên khác.'});throw error;}finally{db.release();}
}));
router.post('/login',limitAuth,wrap(async(req,res)=>{
 const {username,password}=req.body;
 if(typeof username!=='string'||username.length>30||!validPassword(password))return res.status(400).json({error:'Tên hoặc mật khẩu không đúng.'});
 const {rows}=await pool.query('SELECT * FROM accounts WHERE name_key=$1',[key(username.trim())]);
 const account=rows[0];
 if(!await verifyPassword(password,account?.password_hash))return res.status(401).json({error:'Tên hoặc mật khẩu không đúng.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const current=(await db.query('SELECT password_hash FROM accounts WHERE id=$1 FOR UPDATE',[account.id])).rows[0];
  if(current.password_hash!==account.password_hash){await db.query('ROLLBACK');return res.status(401).json({error:'Mật khẩu vừa thay đổi. Vui lòng đăng nhập lại.'});}
  const token=await createSession(db,account.id);
  await db.query("INSERT INTO account_events(account_id,event) VALUES($1,'login')",[account.id]);
  await db.query('DELETE FROM account_sessions WHERE expires_at<now()');
  await db.query('COMMIT');setSession(res,token);res.json({user:publicUser(account)});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}));
router.get('/me',authenticateToken,(req,res)=>res.json({user:publicUser(req.account)}));
router.post('/logout',authenticateToken,wrap(async(req,res)=>{
 await pool.query('DELETE FROM account_sessions WHERE token_hash=$1',[req.sessionHash]);
 const io=req.app.get('io');if(io)for(const socket of io.sockets.sockets.values())if(socket.sessionHash===req.sessionHash)socket.disconnect(true);
 clearSession(res);res.sendStatus(204);
}));
router.post('/password',authenticateToken,limitAuth,wrap(async(req,res)=>{
 const {password,currentPassword}=req.body;
 if(!validPassword(password))return res.status(400).json({error:'Vui lòng nhập mật khẩu mới.'});
 if(!await verifyPassword(currentPassword,req.account.password_hash))return res.status(400).json({error:'Mật khẩu hiện tại chưa đúng.'});
 const hash=await hashPassword(password);const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const result=await db.query('UPDATE accounts SET password_hash=$1,updated_at=now() WHERE id=$2 AND password_hash=$3',[hash,req.account.id,req.account.password_hash]);
  if(!result.rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'Mật khẩu vừa thay đổi, hãy thử lại.'});}
  await db.query('DELETE FROM account_sessions WHERE account_id=$1',[req.account.id]);
  const token=await createSession(db,req.account.id);
  await db.query("INSERT INTO account_events(account_id,event) VALUES($1,'password_changed')",[req.account.id]);
  await db.query('COMMIT');setSession(res,token);disconnectAccount(req.app.get('io'),req.account.id);res.json({user:publicUser(req.account)});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}));
router.use((error,req,res,next)=>{res.status(error.status||503).json({error:error.status?error.message:'Chưa thể xử lý tài khoản. Vui lòng thử lại.'});});
module.exports=router;
