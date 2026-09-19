if (!process.env.PORT) {
  process.env.PORT = '4000';
}

const requiredEnvs = [
  'JWT_SECRET',
  'DATABASE_URL'
];

const checkEnv = () => {
  const missing = requiredEnvs.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    process.exit(1);
  }
  
  console.log('✅ All environment variables configured');
};

module.exports = { checkEnv };
