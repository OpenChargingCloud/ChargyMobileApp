const fs    = require('fs');
const path  = require('path');
const { spawnSync } = require('child_process');

function runNodeScript(projectRoot, script, args) {

	const executable = path.join(projectRoot,
								 'node_modules',
								 ...script);

	const result = spawnSync(process.execPath, [executable, ...args], {
		cwd:   projectRoot,
		stdio: 'inherit'
	});

	if (result.error)
		throw result.error;

	if (result.status !== 0)
		throw new Error(script.join(path.sep) + ' failed with exit code ' + result.status);

}

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

	function ensureDirectory(directoryName) {

		if (!fs.existsSync(directoryName))
			fs.mkdirSync(directoryName, { recursive: true });

	}

	function copyFile(sourceFile, targetFile) {

		ensureDirectory(path.dirname(targetFile));

		console.log("Copying " + sourceFile.replace(ctx.opts.projectRoot, "") + " => " + targetFile.replace(ctx.opts.projectRoot, ""));

		fs.copyFileSync(sourceFile,
						targetFile);

	}

	function copyDirectoryContents(sourceDirectory, targetDirectory) {

		ensureDirectory(targetDirectory);

		fs.readdirSync(sourceDirectory).forEach(sourceFile => {
			copyFile(path.join(sourceDirectory, sourceFile),
					 path.join(targetDirectory, sourceFile));
		});

	}

	function copyLeafletAssets() {

		const leafletTarget = path.join(wwwTarget, 'lib', 'leaflet');

		fs.rmSync(leafletTarget, { recursive: true, force: true });
		ensureDirectory(leafletTarget);

		const leafletDist = path.join(ctx.opts.projectRoot, 'node_modules', 'leaflet', 'dist');
		copyFile(path.join(leafletDist, 'leaflet.css'),         path.join(leafletTarget, 'leaflet.css'));
		copyFile(path.join(leafletDist, 'leaflet.js'),          path.join(leafletTarget, 'leaflet.js'));
		copyFile(path.join(leafletDist, 'leaflet.js.map'),      path.join(leafletTarget, 'leaflet.js.map'));
		copyFile(path.join(leafletDist, 'leaflet-src.js'),      path.join(leafletTarget, 'leaflet-src.js'));
		copyFile(path.join(leafletDist, 'leaflet-src.js.map'),  path.join(leafletTarget, 'leaflet-src.js.map'));
		copyDirectoryContents(path.join(leafletDist, 'images'),
							  path.join(leafletTarget, 'images'));

		const locateDist = path.join(ctx.opts.projectRoot, 'node_modules', 'leaflet.locatecontrol', 'dist');
		copyFile(path.join(locateDist, 'L.Control.Locate.umd.js'),       path.join(leafletTarget, 'L.Control.Locate.js'));
		copyFile(path.join(locateDist, 'L.Control.Locate.min.js'),       path.join(leafletTarget, 'L.Control.Locate.min.js'));
		copyFile(path.join(locateDist, 'L.Control.Locate.min.js.map'),   path.join(leafletTarget, 'L.Control.Locate.min.js.map'));
		copyFile(path.join(locateDist, 'L.Control.Locate.min.css'),      path.join(leafletTarget, 'L.Control.Locate.min.css'));
		copyFile(path.join(locateDist, 'L.Control.Locate.min.css.map'),  path.join(leafletTarget, 'L.Control.Locate.min.css.map'));

		const awesomeMarkersDist = path.join(ctx.opts.projectRoot, 'node_modules', 'leaflet.awesome-markers', 'dist');
		copyFile(path.join(awesomeMarkersDist, 'leaflet.awesome-markers.css'),     path.join(leafletTarget, 'leaflet.awesome-markers.css'));
		copyFile(path.join(awesomeMarkersDist, 'leaflet.awesome-markers.js'),      path.join(leafletTarget, 'leaflet.awesome-markers.js'));
		copyFile(path.join(awesomeMarkersDist, 'leaflet.awesome-markers.min.js'),  path.join(leafletTarget, 'leaflet.awesome-markers.min.js'));
		copyDirectoryContents(path.join(awesomeMarkersDist, 'images'),
							  path.join(leafletTarget, 'images'));

	}

	const wwwSource = path.join(ctx.opts.projectRoot, 'src');
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
		copyLeafletAssets();


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
				// 	// file:///E:/Coding/CardiLink/Cordova/CardiMobileApp/src/sass/styles.scss
				//     map.sources[i] = "../.." + map.sources[i].substring(map.sources[i].indexOf('/src'));
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

		runNodeScript(ctx.opts.projectRoot, ['typescript', 'bin', 'tsc'], []);


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
				// 	// file:///E:/Coding/CardiLink/Cordova/CardiMobileApp/src/sass/styles.scss
				//     map.sources[i] = "../.." + map.sources[i].substring(map.sources[i].indexOf('/src'));
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

		runNodeScript(ctx.opts.projectRoot, ['sass', 'sass.js'], [
			'src/scss/styles.scss',
			'www/css/styles.css'
		]);


// Bundle

		runNodeScript(ctx.opts.projectRoot, ['webpack', 'bin', 'webpack.js'], [
			'--config',
			'webpack.config.cjs'
		]);

		console.log('App is ready!');

	}

};
