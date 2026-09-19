const multer = require('multer');

// File size limits
const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB max
};

// File type validation
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // docx
  ];
  
  if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

const upload = multer({
  limits,
  fileFilter,
  storage: multer.memoryStorage() // Don't save to disk immediately, use memory
});

module.exports = { upload };
