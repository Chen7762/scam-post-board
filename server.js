const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');


const app = express();
const db = new sqlite3.Database('./database.db');


// 中介層設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('views'));


app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }, // 1 小時
    httpOnly: true,
    sameSite: 'lax'
}));


// 註冊
app.post('/register', async (req, res) => {
    const { username, email, phone, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: '請填寫必填欄位' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
        if (err) return res.status(500).json({ message: '資料庫錯誤' });
        if (row) {
            return res.status(400).json({ message: '此 Email 已被註冊' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            db.run(
                'INSERT INTO users (username, email, phone, password) VALUES (?, ?, ?, ?)',
                [username, email, phone || '', hashedPassword],
                function (err) {
                    if (err) return res.status(500).json({ message: '註冊失敗' });
                    res.json({ message: '註冊成功' });
                }
            );
        } catch {
            return res.status(500).json({ message: '密碼加密失敗' });
        }
    });
});


// 登入
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '請填寫 Email 和密碼' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ message: '資料庫錯誤' });
        if (!user) return res.status(400).json({ message: '帳號不存在' });

        try {
            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return res.status(401).json({ message: '密碼錯誤' });

            req.session.user = { id: user.id, username: user.username };
            res.json({ message: '登入成功', username: user.username });
        } catch {
            res.status(500).json({ message: '密碼驗證失敗' });
        }
    });
});


// 登出
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: '登出成功' });
});

//顯示登入者名稱
app.get('/api/current-user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: '未登入' });
  }
  res.json({ username: req.session.user.username });
});


// 新增留言
app.post('/add-post', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: '未登入' });

    const { category, content } = req.body;
    const userId = req.session.user.id;


    db.run(
        'INSERT INTO posts (user_id, category, content) VALUES (?, ?, ?)',
        [userId, category, content],
        function (err) {
            if (err) return res.status(500).json({ message: '留言失敗' });
            res.json({ message: '留言成功' });
        }
    );
});


// **重要修改：將 /posts/my 放在 /posts/:category 之前**

// 個人留言 - 必須放在類別留言列表之前，以確保被正確匹配
app.get('/posts/my', (req, res) => {

    if (!req.session.user) {
        console.log('未登入，返回 401');
        return res.status(401).json({ message: '未登入' });
    }

    const userId = req.session.user.id;

    db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC',
        [userId], (err, rows) => {
            if (err) {
                return res.status(500).json({ message: '載入失敗' });
            }
            res.json(rows);
        });
});


// 刪除留言
app.delete('/posts/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: '未登入' });

  const postId = req.params.id;
  const userId = req.session.user.id;

  db.run('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId], function(err) {
    if (err) return res.status(500).json({ message: '刪除失敗' });

    if (this.changes === 0) {
      return res.status(403).json({ message: '無權刪除此留言或留言不存在' });
    }

    res.json({ message: '刪除成功' });
  });
});




// 類別留言列表 - 通用路由，放在 /posts/my 之後
app.get('/posts/:category', (req, res) => {
    const category = req.params.category;

    db.all(`
        SELECT posts.id, posts.content, posts.created_at, users.username, posts.category
        FROM posts
        JOIN users ON posts.user_id = users.id
        WHERE category = ?
        ORDER BY created_at DESC
    `, [category], (err, rows) => {
        if (err) {
            console.error('類別留言載入失敗:', err);
            return res.status(500).json({ message: '載入失敗' });
        }
        res.json(rows);
    });
});


// 預設首頁導向
app.get('/', (req, res) => {
    res.redirect('/index.html');
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`伺服器啟動中：http://localhost:${PORT}`);
});