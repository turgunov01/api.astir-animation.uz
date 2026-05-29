module.exports = {
  apps : [{
    script: 'index.js',
    watch: '.'
  }, {
    script: './service-worker/',
    watch: ['./service-worker']
  }],

  deploy : {
    production : {
      user : 'root',
      host : '96.46.96.48',
      ref  : 'origin/master',
      repo : 'https://github.com/turgunov01/api.astir-animation.uz.git',
      path : '/var/www/api.astir.uz',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
