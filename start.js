const path = require('path');
const chalk = require('chalk');
const { spawn } = require('child_process');
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

// ═══════════════════════════════════════════════════════════
// 🤖 සියලුම platform හරියනවා
// Termux, Ubuntu, VPS, Windows(WSL), macOS
// ═══════════════════════════════════════════════════════════

// Color functions
const log = {
    info: (msg) => console.log(`${chalk.cyan('ℹ')} ${msg}`),
    success: (msg) => console.log(`${chalk.green('✓')} ${msg}`),
    error: (msg) => console.log(`${chalk.red('✗')} ${msg}`),
    warn: (msg) => console.log(`${chalk.yellow('⚠')} ${msg}`),
    header: (msg) => console.log(`\n${chalk.bold.blue('═══════════════════════════════════')}\n${chalk.bold.cyan(msg)}\n${chalk.bold.blue('═══════════════════════════════════')}\n`)
};

// Detect OS Type
function detectOS() {
    const platform = os.platform();
    const release = os.release();
    
    // Check if Termux
    const isTermux = fs.existsSync('/system/build.prop') || fs.existsSync('/data/data/com.termux');
    
    if (isTermux) {
        return {
            type: 'termux',
            display: 'Termux (Android)',
            pm: 'atp', // Termux package manager
            pmAlternate: 'pkg'
        };
    }
    
    // Check if Ubuntu/Debian
    if (platform === 'linux') {
        if (fs.existsSync('/etc/lsb-release') || fs.existsSync('/etc/debian_version')) {
            // Check if running in WSL
            const isWSL = release.toLowerCase().includes('microsoft') || fs.existsSync('/proc/version') && 
                         fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
            
            if (isWSL) {
                return {
                    type: 'wsl',
                    display: 'Windows WSL (Ubuntu)',
                    pm: 'apt',
                    pmAlternate: 'apt-get'
                };
            }
            
            return {
                type: 'ubuntu',
                display: 'Ubuntu/Debian/VPS',
                pm: 'apt',
                pmAlternate: 'apt-get'
            };
        }
    }
    
    // Check if macOS
    if (platform === 'darwin') {
        return {
            type: 'macos',
            display: 'macOS',
            pm: 'brew',
            pmAlternate: 'homebrew'
        };
    }
    
    // Default to Linux
    return {
        type: 'linux',
        display: 'Linux (Generic)',
        pm: 'apt',
        pmAlternate: 'apt-get'
    };
}

// Check if package installed
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

// Check if system command exists
function commandExists(cmd) {
    try {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

// Get installation commands for OS
function getInstallCommands(osInfo, packages) {
    const cmds = {
        termux: {
            update: 'atp update',
            install: `atp install ${packages.join(' ')}`
        },
        ubuntu: {
            update: 'apt update',
            install: `sudo apt install -y ${packages.join(' ')}`
        },
        wsl: {
            update: 'apt update',
            install: `sudo apt install -y ${packages.join(' ')}`
        },
        macos: {
            update: 'brew update',
            install: `brew install ${packages.join(' ')}`
        },
        linux: {
            update: 'apt update',
            install: `sudo apt install -y ${packages.join(' ')}`
        }
    };
    
    return cmds[osInfo.type] || cmds.linux;
}

// Auto install missing packages
async function autoInstallDependencies() {
    const osInfo = detectOS();
    
    log.header(`🤖 🌸MISS SHASIKALA START කරමින්\n${chalk.yellow(`Platform: ${osInfo.display}`)}`);

    // Check npm
    if (!checkNpmInstalled()) {
        log.error('npm හමු නොවුණි!');
        log.info(`කරුණාකර install Node.js ඉල්ලන්න.`);
        
        const commands = getInstallCommands(osInfo, ['nodejs', 'npm']);
        log.info(`\nInstall commands:\n  ${commands.update}\n  ${commands.install}`);
        
        process.exit(1);
    }

    log.success('npm found!');

    // Check package.json
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        log.error(`package.json හමු නොවුණි! (${packageJsonPath})`);
        process.exit(1);
    }

    // Read package.json
    let packageJson;
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
        log.error('package.json ලබාගැනීම කිරීමට අසාර්ථකයි: ' + e.message);
        process.exit(1);
    }

    const dependencies = packageJson.dependencies || {};
    const dependencyNames = Object.keys(dependencies);

    log.info(`සියලුම npm පැකේජ ඉල්ලමින්: ${chalk.yellow(dependencyNames.length)}`);

    // Check each dependency
    let missingPackages = [];
    let installedCount = 0;

    console.log('\n📦 npm පැකේජ සොයමින්...\n');

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

    // If missing packages found, install them
    if (missingPackages.length > 0) {
        log.warn(`${missingPackages.length} නැතිවූ NPM පැකේජ හමු උණි!`);
        console.log(`\nMissing:\n${missingPackages.map(p => `  • ${chalk.yellow(p)}`).join('\n')}\n`);

        log.info('ලබාගැනීම ආරම්භ කරයි...\n');

        try {
            log.header('📥 කරමින්: npm install');
            
            execSync('npm install', {
                stdio: 'inherit',
                cwd: __dirname
            });

            log.success('සියළුම NPM පැකේජ ලබාගන්නා ලදි!');
        } catch (e) {
            log.error('npm ලබාගැනීම අසාර්ථකයි!');
            log.info('Please try manual installation:\n  npm install');
            process.exit(1);
        }
    } else {
        log.success('දැනටමත් සියලුම npm ලබාගෙන ඇත!');
    }

    // Check system dependencies
    log.header('🔧 system පරීක්ෂා කරමින්');
    
    const systemDeps = {
        'ffmpeg': 'media processing',
        'python': 'python scripts',
        'curl': 'http requests'
    };

    let missingSystemDeps = [];

    for (const [cmd, desc] of Object.entries(systemDeps)) {
        if (commandExists(cmd)) {
            console.log(`  ${chalk.green('✓')} ${cmd.padEnd(12)} - ${desc}`);
        } else {
            console.log(`  ${chalk.red('✗')} ${cmd.padEnd(12)} - ${desc}`);
            missingSystemDeps.push(cmd);
        }
    }

    if (missingSystemDeps.length > 0) {
        log.warn(`Missing system dependencies: ${missingSystemDeps.join(', ')}`);
        
        const installCmds = getInstallCommands(osInfo, missingSystemDeps);
        
        console.log(`\n${chalk.cyan(`${osInfo.display} - Installation commands:`)}`);
        console.log(`  ${chalk.yellow(installCmds.update)}`);
        console.log(`  ${chalk.yellow(installCmds.install)}`);
        
        if (osInfo.type === 'termux') {
            log.warn('ඔබ manually install කරන්න අවශ්‍ය විය හැක (if atp fails)');
            console.log(`  ${chalk.cyan('atp update')}`);
            console.log(`  ${chalk.cyan(`atp install ${missingSystemDeps.join(' ')}`)}`);
        }
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

        const osInfo = detectOS();
        log.header(`🚀 MISS SHASIKALA ආරම්භ වෙමින්\n${chalk.yellow(`Platform: ${osInfo.display}`)}`);

        // Start the main application
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
