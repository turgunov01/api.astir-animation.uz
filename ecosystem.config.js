module.exports = {
  apps: [{
    script: 'index.js',
    watch: '.'
  }, {
    script: './service-worker/',
    watch: ['./service-worker']
  }],

  deploy: {
    production: {
      user: "root",
      host: "api.astir.uz",
      ref: "origin/master",
      repo: "git@github.com:turgunov01/api.astir-animation.uz.git",
      path: "/var/www/api.astir.uz",
      "post-deploy": "npm ci --omit=dev && pm2 startOrReload ecosystem.config.cjs --env production"
    }
  }
};
