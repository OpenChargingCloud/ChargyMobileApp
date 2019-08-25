const fs    = require('fs');
const path  = require('path');
const sass  = require('sass');
const ts    = require("typescript");
const util  = require('util');
const shell = require('shelljs');

module.exports = function(ctx) {

	function copyFiles(src, trg, recursive) {
		
		fs.readdirSync(src).forEach(sourceFile => {

			var sourceFileWithPath = path.join(src, sourceFile);
			var targetFileWithPath = path.join(trg, sourceFile);

			if (fs.statSync(sourceFileWithPath).isFile())
			{

				console.log("Copying " + sourceFileWithPath.replace(ctx.opts.projectRoot, "") + " => " + targetFileWithPath.replace(ctx.opts.projectRoot, ""));

				fs.copyFileSync(sourceFileWithPath,
								targetFileWithPath);

			}

			else if (recursive && fs.statSync(sourceFileWithPath).isDirectory())
			{

				if (!fs.existsSync(targetFileWithPath))
					fs.mkdirSync(targetFileWithPath);

				copyFiles(sourceFileWithPath,
						  targetFileWithPath,
						  recursive);

			}
			
		});

	}
	
	function copyDirectory(directoryName, recursive) {

		var sourceDirectory = path.join(wwwSource, directoryName);

		if (fs.existsSync(sourceDirectory))
		{

			var targetDirectory = path.join(wwwTarget, directoryName)

			if (!fs.existsSync(targetDirectory))
				fs.mkdirSync(targetDirectory);

            copyFiles(sourceDirectory,
                      targetDirectory,
                      recursive);

		}

	}

	const wwwSource = path.join(ctx.opts.projectRoot, 'www.src');
	const wwwTarget = path.join(ctx.opts.projectRoot, 'www');
	
	if (!fs.existsSync(wwwSource))
		throw {
			name:     "DirectoryNotFound",
			message:  "Source directory " + wwwSource + " not found!",
			toString: function() {
				return this.name + ": " + this.message;
			}
		};
	
	else
	{
	
		if (!fs.existsSync(wwwTarget))
			fs.mkdirSync(wwwTarget);
		
		copyFiles(wwwSource, wwwTarget);
		copyDirectory('css',    true);
		copyDirectory('js',     true);
		copyDirectory('lib',    true);
		copyDirectory('images', true);
		copyDirectory('webfonts');


// TypeScript

		const tsSource = path.join(wwwSource, 'ts');
		const jsTarget = path.join(wwwTarget, 'js');
		if (!fs.existsSync(jsTarget))
			fs.mkdirSync(jsTarget);
		
/* 		fs.readdirSync(tsSource).forEach(sourceFile => {

			var targetFile          = sourceFile.substring(0, sourceFile.length - 5) + '.js';
			var sourceFileWithPath  = path.join(tsSource, sourceFile);
			var targetFileWithPath  = path.join(jsTarget, targetFile);

			console.log(">>> typescript compile: " + sourceFile + " => " + targetFile + " <<<");

			if (sourceFile.endsWith('.ts') && fs.statSync(sourceFileWithPath).isFile()) {
			
				var result = ts.transpileModule({
					file: 	   sourceFileWithPath,
					sourceMap: false,
					outFile:   targetFile
				});

				fs.writeFile(targetFileWithPath,
							 result.css.toString(),
							 (err) => {
								 if (err) console.log(err);
							 });

				// var map = JSON.parse(result.map.toString());
				
				// for (i = 0; i < map.sources.length; i++) { 
				// 	console.log(map.sources[i]);
				// 	// file:///E:/Coding/CardiLink/Cordova/CardiMobileApp/www.src/sass/styles.scss
				//     map.sources[i] = "../.." + map.sources[i].substring(map.sources[i].indexOf('/www.src'));
				// 	console.log(map.sources[i]);
				// }

				// fs.writeFile(targetFileWithPath + '.map',
				// 			 JSON.stringify(map),
				// 			 (err) => {
				// 				 if (err) console.log(err);
				// 			 });
							 
			}
			else
			{
				console.log(sourceFile + " failed!");
			}

		}); */

		if (shell.exec('tsc').code !== 0) {
			shell.echo('Error: typescript compile failed');
			shell.exit(1);
		}


// SASS

		const sassSource = path.join(wwwSource, 'scss');
		const cssTarget  = path.join(wwwTarget, 'css');
		if (!fs.existsSync(cssTarget))
			fs.mkdirSync(cssTarget);

/*		fs.readdirSync(sassSource).forEach(sourceFile => {

			var targetFile          = sourceFile.substring(0, sourceFile.length - 5) + '.css';
			var sourceFileWithPath  = path.join(sassSource, sourceFile);
			var targetFileWithPath  = path.join(cssTarget,  targetFile);

			if (sourceFile.endsWith('.scss') && fs.statSync(sourceFileWithPath).isFile()) {

				console.log("SASS compile " + sourceFileWithPath.replace(ctx.opts.projectRoot, "") + " => " + targetFileWithPath.replace(ctx.opts.projectRoot, ""));

				var result = sass.renderSync({
					file: 	   sourceFileWithPath,
					sourceMap: false,
					outFile:   targetFile
				});

				fs.writeFile(targetFileWithPath,
							 result.css.toString(),
							 (err) => {
								 if (err) console.log(err);
							 });

				// var map = JSON.parse(result.map.toString());
				
				// for (i = 0; i < map.sources.length; i++) { 
				// 	console.log(map.sources[i]);
				// 	// file:///E:/Coding/CardiLink/Cordova/CardiMobileApp/www.src/sass/styles.scss
				//     map.sources[i] = "../.." + map.sources[i].substring(map.sources[i].indexOf('/www.src'));
				// 	console.log(map.sources[i]);
				// }

				// fs.writeFile(targetFileWithPath + '.map',
				// 			 JSON.stringify(map),
				// 			 (err) => {
				// 				 if (err) console.log(err);
				// 			 });
							 
			}
			else
			{
				console.log(sourceFile + " failed!");
			}

		});	
		 */

		if (shell.exec('sass www.src/scss/styles.scss www/css/styles.css').code !== 0) {
			shell.echo('Error: sass compile failed');
			shell.exit(1);
		}


// Bundle

		if (shell.exec('browserify www/js/index.js -o www/js/bundle.js').code !== 0) {
			shell.echo('Error: browserify failed');
			shell.exit(1);
		}

		console.log('App is ready!');

	}

};
