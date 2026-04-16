module.exports = {
  apps: [{
    name: 'research-agent',
    script: './src/server.js',
    interpreter: 'node',
    cwd: '/home/rico/apps/mission-control/deep-research-agent',  // GraySkull path
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '512M',
    restart_delay: 5000,
    max_restarts: 10,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
