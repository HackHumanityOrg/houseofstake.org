const { spawn } = require('child_process');
const path = require('path');

module.exports = function (context, options) {
  return {
    name: 'github-roadmap-plugin',
    
    async loadContent() {
      // Skip fetching in development mode unless explicitly enabled
      if (process.env.NODE_ENV === 'development' && !process.env.FETCH_GITHUB_DATA) {
        console.log('ℹ️  Skipping GitHub data fetch in development mode');
        console.log('   Set FETCH_GITHUB_DATA=true to fetch data in development');
        return;
      }

      console.log('🔄 Fetching GitHub roadmap data...');
      
      return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'fetch-github-roadmap.js');
        
        const child = spawn('node', [scriptPath], {
          env: { ...process.env },
          stdio: 'inherit',
        });

        child.on('close', (code) => {
          if (code === 0) {
            console.log('✅ GitHub roadmap data fetched successfully');
            resolve();
          } else {
            // Don't fail the build if GitHub data fetch fails
            console.warn('⚠️  Failed to fetch GitHub roadmap data (build will continue)');
            resolve();
          }
        });

        child.on('error', (error) => {
          console.error('❌ Error running GitHub fetch script:', error);
          // Don't fail the build
          resolve();
        });
      });
    },
  };
};