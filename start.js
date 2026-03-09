const path = require('path');
const chalk = require('chalk');
const { spawn } = require('child_process');
const fs = require('fs');
const { execSync } = require('child_process');

// Color functions
const log = {
    info: (msg) => console.log(`${chalk.cyan('ℹ')} ${msg}`),
    success: (msg) => console.log(`${chalk.green('✓')} ${msg}`),
    error: (msg) => console.log(`${chalk.red('✗')} ${msg}`),
    warn: (msg) => console.log(`${chalk.yellow('⚠')} ${msg}`),
    header: (msg) => console.log(`\n${chalk.bold.blue('═══════════════════════════════════')}\n${chalk.bold.cyan(msg)}\n${chalk.bold.blue('═══════════════════════════════════')}\n`)
};

// Check if package is installed
function checkPackageInstalled(packageName) {
    try {
        require.resolve(packageName);
        return true;
    } catch (e) {
        return false;
    }
}

// Check if npm is installed
function checkNpmInstalled() {
    try {
        execSync('npm --version', { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

// Auto install missing packages
async function autoInstallDependencies() {
    log.header('🤖 AUTO PACKAGE INSTALLER');

    // Check npm
    if (!checkNpmInstalled()) {
        log.error('npm found නොවුණු! Please install Node.js සඳහා npm installed කරන්න.');
        log.info('atp update');
        log.info('atp install nodejs npm');
        process.exit(1);
    }

    log.success('npm found!');

    // Check package.json
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        log.error(`package.json found නොවුණු! (${packageJsonPath})`);
        process.exit(1);
    }

    // Read package.json
    let packageJson;
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
        log.error('package.json parse කිරීමට failed: ' + e.message);
        process.exit(1);
    }

    const dependencies = packageJson.dependencies || {};
    const dependencyNames = Object.keys(dependencies);

    log.info(`Total dependencies: ${chalk.yellow(dependencyNames.length)}`);

    // Check each dependency
    let missingPackages = [];
    let installedCount = 0;

    console.log('\n📦 Checking dependencies...\n');

    for (const pkg of dependencyNames) {
        if (checkPackageInstalled(pkg)) {
            console.log(`  ${chalk.green('✓')} ${pkg}`);
            installedCount++;
        } else {
            console.log(`  ${chalk.red('✗')} ${pkg}`);
            missingPackages.push(pkg);
        }
    }

    console.log(`\n${chalk.cyan('Installed:')} ${installedCount}/${dependencyNames.length}`);

    // If missing packages found
    if (missingPackages.length > 0) {
        log.warn(`${missingPackages.length} missing packages found!`);
        console.log(`\nMissing packages:\n${missingPackages.map(p => `  • ${chalk.yellow(p)}`).join('\n')}\n`);

        log.info('ඉතුරු කිරීම ආරම්භ කරයි...\n');

        try {
            // Run npm install
            log.header('📥 Running: npm install');
            
            execSync('npm install', {
                stdio: 'inherit',
                cwd: __dirname
            });

            log.success('All packages installed successfully!');
        } catch (e) {
            log.error('npm install failed!');
            log.info('Please try manual installation:');
            console.log(`  ${chalk.cyan('npm install')}`);
            console.log(`\nError details:\n${e.message}`);
            process.exit(1);
        }
    } else {
        log.success('All required packages already installed!');
    }

    // Check system dependencies (Termux එකඉ atp commands)
    log.header('🔧 Checking System Dependencies');
    
    const systemDeps = {
        'ffmpeg': 'media processing',
        'python': 'python scripts',
        'curl': 'http requests'
    };

    let missingSystemDeps = [];

    for (const [cmd, desc] of Object.entries(systemDeps)) {
        try {
            execSync(`which ${cmd}`, { stdio: 'pipe' });
            console.log(`  ${chalk.green('✓')} ${cmd.padEnd(12)} - ${desc}`);
        } catch (e) {
            console.log(`  ${chalk.red('✗')} ${cmd.padEnd(12)} - ${desc}`);
            missingSystemDeps.push(cmd);
        }
    }

    if (missingSystemDeps.length > 0) {
        log.warn(`Missing system dependencies: ${missingSystemDeps.join(', ')}`);
        console.log(`\n${chalk.cyan('atp (Termux Package Manager) භාවිතයෙන්:')}`);
        console.log(`  ${chalk.yellow('atp update')}`);
        console.log(`  ${chalk.yellow('atp install ' + missingSystemDeps.join(' '))}`);
    } else {
        log.success('All system dependencies found!');
    }

    log.success('Setup verification complete!');
}

// Main process
async function start() {
    try {
        // Check and install dependencies
        await autoInstallDependencies();

        log.header('🚀 STARTING BOT');

        // Now start the main application
        let args = [path.join(__dirname, 'index.js'), ...process.argv.slice(2)];
        let p = spawn(process.argv[0], args, {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc']
        }).on('message', data => {
            if (data === 'reset') {
                console.log(chalk.yellow.bold('[BOT] නැවත පණ ගන්වමින් පවතී...'));
                p.kill();
                start();
            } else if (data === 'uptime') {
                p.send(process.uptime());
            }
        }).on('exit', code => {
            if (code !== 0) {
                console.error(chalk.red.bold(`[BOT] දෝෂ කේතය ${code} සමඟ ක්‍රියාවලිය නැවතුණි. නැවත ආරම්භ කරමින්...`));
                setTimeout(() => start(), 3000);
            } else {
                console.log(chalk.green.bold('[BOT] ක්‍රියාවලිය සාර්ථකව අවසන් විය. සමුගනිමු!'));
                process.exit(0);
            }
        });
    } catch (e) {
        log.error('Startup failed: ' + e.message);
        console.error(e);
        process.exit(1);
    }
}

// Run
start();
