const isWindows = process.platform === "win32";
const script = isWindows ? "cmd.exe" : "npm";
const args = isWindows ? ["/c", "npm", "run", "."] : ["run", "."];

module.exports = {
  apps: [
    {
      name: "astir",
      cwd: __dirname,
      script,
      args,
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        HOST: "0.0.0.0"
      }
    }
  ]
};
