require('dotenv').config();

const express = require('express');

const socketIo = require('socket.io');

const http = require('http');

const path = require('path');

const multer = require('multer');

const fs = require('fs');

const app = express();

const server = http.createServer(app);

const io = socketIo(server);

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    const uploadDir = 'public/uploads/';

    if (!fs.existsSync(uploadDir)) {

      fs.mkdirSync(uploadDir, { recursive: true });

    }

    cb(null, uploadDir);

  },

  filename: (req, file, cb) => {

    cb(null, Date.now() + path.extname(file.originalname));

  }

});

const upload = multer({

  storage: storage,

  limits: { fileSize: 5 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {

    const filetypes = /jpeg|jpg|png|gif/;

    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {

      return cb(null, true);

    }

    cb('Error: Images only!');

  }

});

app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));

app.use(express.json());

app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

const users = {};

const messages = [];

const adminPassword = 'Aymen111';

const bannedUsers = [];

const mutedUsers = {};

const autoResponses = [

  { trigger: 'السلام عليكم', response: 'عليكم السلام ورحمة الله وبركاته' },

  { trigger: '&صلاة', response:'اللهم صلي على سيدنا محمد , صلو على سيدنا محمد عليه افضل صلاة وسلام' },
  
  { trigger: '&مطور', response: 'المطور الرسمي للبرنامج والموقع : Aymen' }
];

const bannedWords = ['سب', 'شتيمة', 'كلمة سيئة'];

app.get('/', (req, res) => {

  res.render('auth/login', { error: null });

});

app.post('/login', (req, res) => {

  const { username } = req.body;

  

  if (!username || username.trim() === '') {

    return res.render('auth/login', { error: 'يرجى إدخال اسم مستخدم' });

  }

  

  if (bannedUsers.includes(username)) {

    return res.render('auth/login', { error: 'هذا المستخدم محظور!' });

  }

  

  res.redirect(`/chat?username=${username}`);

});

app.get('/chat', (req, res) => {

  const { username } = req.query;

  if (!username) return res.redirect('/');

  

  res.render('chat/index', { 

    username,

    isAdmin: username === 'admin' 

  });

});

app.get('/admin', (req, res) => {

  res.render('auth/admin-login', { error: null });

});

app.post('/admin/login', (req, res) => {

  const { password } = req.body;

  if (password === adminPassword) {

    res.redirect('/admin/dashboard');

  } else {

    res.render('auth/admin-login', { error: 'كلمة المرور خاطئة!' });

  }

});

app.get('/admin/dashboard', (req, res) => {

  res.render('admin/dashboard', { 

    users: Object.values(users),

    messages: messages.slice(-100),

    bannedUsers,

    mutedUsers: Object.entries(mutedUsers),

    autoResponses,

    bannedWords

  });

});

app.get('/admin/automod', (req, res) => {

  res.render('admin/automod', {

    bannedWords,

    autoResponses

  });

});

app.post('/admin/ban', (req, res) => {

  const { username, reason, duration } = req.body;

  if (!bannedUsers.includes(username)) {

    bannedUsers.push(username);

    

    if (duration && duration !== 'permanent') {

      setTimeout(() => {

        const index = bannedUsers.indexOf(username);

        if (index > -1) bannedUsers.splice(index, 1);

      }, duration * 60 * 1000);

    }

    

    io.emit('user_banned', { username, reason });

  }

  res.redirect('/admin/dashboard');

});

app.post('/admin/unban', (req, res) => {

  const { username } = req.body;

  const index = bannedUsers.indexOf(username);

  if (index > -1) bannedUsers.splice(index, 1);

  res.redirect('/admin/dashboard');

});

app.post('/admin/mute', (req, res) => {

  const { username, duration } = req.body;

  const muteDuration = parseInt(duration) * 60 * 1000;

  mutedUsers[username] = Date.now() + muteDuration;

  

  setTimeout(() => {

    if (mutedUsers[username] && mutedUsers[username] <= Date.now()) {

      delete mutedUsers[username];

    }

  }, muteDuration);

  

  res.redirect('/admin/dashboard');

});

app.post('/admin/unmute', (req, res) => {

  const { username } = req.body;

  delete mutedUsers[username];

  res.redirect('/admin/dashboard');

});

app.post('/admin/system-message', (req, res) => {

  const { message } = req.body;

  io.emit('system_message', { 

    message,

    timestamp: new Date().toLocaleTimeString()

  });

  res.redirect('/admin/dashboard');

});

app.post('/admin/delete-message', (req, res) => {

  const { messageId } = req.body;

  const index = messages.findIndex(m => m.id === messageId);

  if (index > -1) {

    messages.splice(index, 1);

    io.emit('message_deleted', messageId);

  }

  res.redirect('/admin/dashboard');

});

app.post('/admin/add-auto-response', (req, res) => {

  const { trigger, response } = req.body;

  autoResponses.push({ trigger, response });

  res.redirect('/admin/automod');

});

app.post('/admin/remove-auto-response', (req, res) => {

  const { index } = req.body;

  autoResponses.splice(index, 1);

  res.redirect('/admin/automod');

});

app.post('/admin/add-banned-word', (req, res) => {

  const { word } = req.body;

  if (!bannedWords.includes(word)) {

    bannedWords.push(word);

  }

  res.redirect('/admin/automod');

});

app.post('/admin/remove-banned-word', (req, res) => {

  const { word } = req.body;

  const index = bannedWords.indexOf(word);

  if (index > -1) {

    bannedWords.splice(index, 1);

  }

  res.redirect('/admin/automod');

});

io.on('connection', (socket) => {

  socket.on('register_user', (username) => {

    users[socket.id] = username;

    socket.username = username;

    io.emit('user_joined', `${username} انضم للدردشة!`);

    io.emit('update_users', Object.values(users));

  });

  socket.on('send_message', (data) => {

    if (mutedUsers[socket.username] && mutedUsers[socket.username] > Date.now()) {

      return socket.emit('muted', 'تم كتم صوتك ولا يمكنك إرسال الرسائل');

    }

    const containsBannedWord = bannedWords.some(word => 

      data.text.toLowerCase().includes(word.toLowerCase())

    );

    if (containsBannedWord) {

      socket.emit('banned_word', 'تم حظر رسالتك لاحتوائها على كلمات غير مسموحة');

      return;

    }

    const autoResponse = autoResponses.find(response => 

      data.text.toLowerCase().includes(response.trigger.toLowerCase())

    );

    const message = {

      id: Date.now().toString(),

      username: socket.username,

      text: data.text,

      timestamp: new Date().toLocaleTimeString(),

      isImage: data.isImage,

      imageUrl: data.imageUrl

    };

    

    messages.push(message);

    io.emit('new_message', message);

    if (autoResponse) {

      const responseMessage = {

        id: Date.now().toString(),

        username: 'Last System',

        text: autoResponse.response,

        timestamp: new Date().toLocaleTimeString(),

        isSystem: true

      };

      setTimeout(() => {

        messages.push(responseMessage);

        io.emit('new_message', responseMessage);

      }, 1000);

    }

  });

  socket.on('disconnect', () => {

    if (socket.username) {

      io.emit('user_left', `${socket.username} غادر الدردشة!`);

      delete users[socket.id];

      io.emit('update_users', Object.values(users));

    }

  });

});

const PORT = process.env.PORT || 3000; //بورت هنا

server.listen(PORT, () => {

  console.log(`Server turned on`);
console.log(`Made by Wick Studio`);
});