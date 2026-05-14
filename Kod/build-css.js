var CleanCSS = require('clean-css');
var fs = require('fs');
var path = require('path');

var input = fs.readFileSync(path.join(__dirname, 'app.css'), 'utf8');
var result = new CleanCSS({ level: 2 }).minify(input);

if (result.errors.length) {
  console.error('CSS-minifieringsfel:');
  result.errors.forEach(function(e) { console.error('  ' + e); });
  process.exit(1);
}

if (result.warnings.length) {
  console.warn('CSS-varningar:');
  result.warnings.forEach(function(w) { console.warn('  ' + w); });
}

var outPath = path.join(__dirname, 'app.min.css');
fs.writeFileSync(outPath, result.styles);
console.log('app.min.css genererad (' + result.styles.length + ' bytes)');
