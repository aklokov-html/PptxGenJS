/*\
|*|  :: pptxgen.js ::
|*|
|*|  A complete JavaScript PowerPoint presentation creator framework for client browsers.
|*|  https://github.com/gitbrent/PptxGenJS
|*|
|*|  This framework is released under the MIT Public License (MIT)
|*|
|*|  PptxGenJS (C) 2015-2016 Brent Ely -- https://github.com/gitbrent
|*|
|*|  Permission is hereby granted, free of charge, to any person obtaining a copy
|*|  of this software and associated documentation files (the "Software"), to deal
|*|  in the Software without restriction, including without limitation the rights
|*|  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
|*|  copies of the Software, and to permit persons to whom the Software is
|*|  furnished to do so, subject to the following conditions:
|*|
|*|  The above copyright notice and this permission notice shall be included in all
|*|  copies or substantial portions of the Software.
|*|
|*|  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
|*|  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
|*|  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
|*|  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
|*|  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
|*|  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
|*|  SOFTWARE.
\*/

/*
	PPTX Units are "DXA" (except for font sizing)
	....: There are 1440 DXA per inch. 1 inch is 72 points. 1 DXA is 1/20th's of a point (20 DXA is 1 point).
	....: There is also something called EMU's (914400 EMUs is 1 inch, 12700 EMUs is 1pt).
	SEE: https://startbigthinksmall.wordpress.com/2010/01/04/points-inches-and-emus-measuring-units-in-office-open-xml/
	|
	OBJECT LAYOUTS: 16x9 (10" x 5.625"), 16x10 (10" x 6.25"), 4x3 (10" x 7.5"), Wide (13.33" x 7.5")
	|
	REFS:
	* "Structure of a PresentationML document (Open XML SDK)"
	* SEE: https://msdn.microsoft.com/en-us/library/office/gg278335.aspx
	* TableStyleId enumeration
	* SEE: https://msdn.microsoft.com/en-us/library/office/hh273476(v=office.14).aspx
*/

// POLYFILL (SEE: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger)
Number.isInteger = Number.isInteger || function(value) {
	return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
};

var PptxGenJS = function(){
	// CONSTS
	var APP_VER = "1.0.0"; // Used for API versioning
	var BLD_VER = "20160402"
	var LAYOUTS = {
		'LAYOUT_4x3'  : { name: 'screen4x3',   width:  9144000, height: 6858000 },
		'LAYOUT_16x9' : { name: 'screen16x9',  width:  9144000, height: 5143500 },
		'LAYOUT_16x10': { name: 'screen16x10', width:  9144000, height: 5715000 },
		'LAYOUT_WIDE' : { name: 'custom',      width: 12191996, height: 6858000 }
	};
	var BASE_SHAPES = {
		RECTANGLE: { 'displayName': 'Rectangle', 'name': 'rect', 'avLst': {} },
		LINE:      { 'displayName': 'Line', 'name': 'line', 'avLst': {} }
	};
	var SLDNUMFLDID = '{F7021451-1387-4CA6-816F-3879F97B5CBC}';
	var EMU = 914400;	// One (1) Inch - OfficeXML measures in EMU (English Metric Units)
	var ONEPT = 12700;	// One (1) point (pt)
	var CRLF = '\r\n';

	// A: Create internal pptx object
	var gObjPptx = {};

	// B: Set Presentation Property Defaults
	gObjPptx.title = 'PptxGenJS Presentation';
	gObjPptx.fileName = 'Presentation';
	gObjPptx.fileExtn = '.pptx';
	gObjPptx.pptLayout = LAYOUTS['LAYOUT_16x9'];
	gObjPptx.slides = [];

	// C: Expose shape library to clients
	this.shapes  = (typeof gObjPptxShapes  !== 'undefined') ? gObjPptxShapes  : BASE_SHAPES;
	this.masters = (typeof gObjPptxMasters !== 'undefined') ? gObjPptxMasters : {};

	// D: Check for associated .js files and provide warings about anything missing
	if ( typeof gObjPptxShapes === 'undefined' ) {
		gObjPptxShapes = BASE_SHAPES;
		try { console.warn("[WARN]: Please include the 'pptxgen.shapes.js' file if you want shapes!"); } catch(ex){}
	}

	/* ===============================================================================================
	|
	#     #
	#     #  ######  #       #####   ######  #####    ####
	#     #  #       #       #    #  #       #    #  #
	#######  #####   #       #    #  #####   #    #   ####
	#     #  #       #       #####   #       #####        #
	#     #  #       #       #       #       #   #   #    #
	#     #  ######  ######  #       ######  #    #   ####
	|
	==================================================================================================
	*/

	/**
	 * Export the .pptx file (using saveAs - dep. filesaver.js)
	 * @param {string} [inStrExportName] - Filename to use for the export
	 */
	function doExportPresentation() {
		var intSlideNum = 0, intRels = 0;

		// =======
		// STEP 1: Create new JSZip file
		// =======
		var zip = new JSZip();

		// =======
		// STEP 2: Add all required folders and files
		// =======
		zip.folder("_rels");
		zip.folder("docProps");
		zip.folder("ppt").folder("_rels");
		zip.folder("ppt/media");
		zip.folder("ppt/slideLayouts").folder("_rels");
		zip.folder("ppt/slideMasters").folder("_rels");
		zip.folder("ppt/slides").folder("_rels");
		zip.folder("ppt/theme");

		zip.file("[Content_Types].xml", makeXmlContTypes());
		zip.file("_rels/.rels", makeXmlRootRels());
		zip.file("docProps/app.xml", makeXmlApp());
		zip.file("docProps/core.xml", makeXmlCore());
		zip.file("ppt/_rels/presentation.xml.rels", makeXmlPresentationRels());

		// Create a Layout/Master/Rel/Slide file for each SLIDE
		for ( var idx=0; idx<gObjPptx.slides.length; idx++ ) {
			intSlideNum++;
			zip.file("ppt/slideLayouts/slideLayout"+ intSlideNum +".xml", makeXmlSlideLayout( intSlideNum ));
			zip.file("ppt/slideLayouts/_rels/slideLayout"+ intSlideNum +".xml.rels", makeXmlSlideLayoutRel( intSlideNum ));
			zip.file("ppt/slides/slide"+ intSlideNum +".xml", makeXmlSlide(gObjPptx.slides[idx]));
			zip.file("ppt/slides/_rels/slide"+ intSlideNum +".xml.rels", makeXmlSlideRel( intSlideNum ));
		}
		zip.file("ppt/slideMasters/slideMaster1.xml", makeXmlSlideMaster());
		zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", makeXmlSlideMasterRel());

		// Add all images
		for ( var idx=0; idx<gObjPptx.slides.length; idx++ ) {
			for ( var idy=0; idy<gObjPptx.slides[idx].rels.length; idy++ ) {
				intRels++;
				zip.file("ppt/media/image"+intRels+"."+gObjPptx.slides[idx].rels[idy].extn, gObjPptx.slides[idx].rels[idy].data, {base64:true});
			}
		}

		zip.file("ppt/theme/theme1.xml", makeXmlTheme());
		zip.file("ppt/presentation.xml", makeXmlPresentation());
		zip.file("ppt/presProps.xml", makeXmlPresProps());
		zip.file("ppt/tableStyles.xml", makeXmlTableStyles());
		zip.file("ppt/viewProps.xml", makeXmlViewProps());

		// =======
		// STEP 3: Push the PPTX file to browser
		// =======
		var strExportName = ((gObjPptx.fileName.toLowerCase().indexOf('.ppt') > -1) ? gObjPptx.fileName : gObjPptx.fileName+gObjPptx.fileExtn);
		saveAs( zip.generate({type:"blob"}), strExportName );
	}

	function componentToHex(c) {
		var hex = c.toString(16);
		return hex.length == 1 ? "0" + hex : hex;
	}

	/**
	 * Used by {addSlidesForTable} to convert RGB colors from jQuery selectors to Hex for Presentation colors
	 */
	function rgbToHex(r, g, b) {
		if (! Number.isInteger(r)) { try { console.warn('Integer expected!'); } catch(ex){} }
		return (componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase();
	}

	function inch2Emu(inches) {
		// FIRST: Provide Caller Safety: Numbers may get conv<->conv during flight, so be kind and do some simple checks to ensure inches were passed
		// Any value over 100 damn sure isnt inches, must be EMU already, so just return it
		if (inches > 100) return inches;
		if ( typeof inches == 'string' ) inches = Number( inches.replace(/in*/gi,'') );
		return Math.round(EMU * inches);
	}

	function getSizeFromImage(inImgUrl) {
		// A: Create
		var image = new Image();

		// B: Set onload event
		image.onload = function(){
			// FIRST: Check for any errors: This is the best method (try/catch wont work, etc.)
			if (this.width + this.height == 0) { return { width:0, height:0 }; }
			var obj = { width:this.width, height:this.height };
			return obj;
		};
		image.onerror = function(){
			try { console.error( '[Error] Unable to load image: ' + inImgUrl ); } catch(ex){}
		};

		// C: Load image
		image.src = inImgUrl;
	}

	function convertImgToDataURLviaCanvas(slideRel, callback){
		// A: Create
	    var image = new Image();
		// B: Set onload event
	    image.onload = function(){
			// First: Check for any errors: This is the best method (try/catch wont work, etc.)
			if (this.width + this.height == 0) { this.onerror(); return; }
	        var canvas = document.createElement('CANVAS');
	        var ctx = canvas.getContext('2d');
	        canvas.height = this.height;
	        canvas.width  = this.width;
	        ctx.drawImage(this, 0, 0);
			// Users running on local machine will get the following error:
			// "SecurityError: Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported."
			// when the canvas.toDataURL call executes below.
			try { callback( canvas.toDataURL(slideRel.type), slideRel ); }
			catch(ex) {
				this.onerror();
				console.log("NOTE: Browsers wont let you load/convert local images! (search for --allow-file-access-from-files)");
				return;
			}
	        canvas = null;
	    };
		image.onerror = function(){
			try { console.error( '[Error] Unable to load image: ' + slideRel.path ); } catch(ex){}
			// Return a predefined "Broken image" graphic so the user will see something on the slide
			callbackImgToDataURLDone('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAB3CAYAAAD1oOVhAAAGAUlEQVR4Xu2dT0xcRRzHf7tAYSsc0EBSIq2xEg8mtTGebVzEqOVIolz0siRE4gGTStqKwdpWsXoyGhMuyAVJOHBgqyvLNgonDkabeCBYW/8kTUr0wsJC+Wfm0bfuvn37Znbem9mR9303mJnf/Pb7ed95M7PDI5JIJPYJV5EC7e3t1N/fT62trdqViQCIu+bVgpIHEo/Hqbe3V/sdYVKHyWSSZmZm8ilVA0oeyNjYmEnaVC2Xvr6+qg5fAOJAz4DU1dURGzFSqZRVqtMpAFIGyMjICC0vL9PExIRWKADiAYTNshYWFrRCARAOEFZcCKWtrY0GBgaUTYkBRACIE4rKZwqACALR5RQAqQCIDqcASIVAVDsFQCSAqHQKgEgCUeUUAPEBRIVTAMQnEBvK5OQkbW9vk991CoAEAMQJxc86BUACAhKUUwAkQCBBOAVAAgbi1ykAogCIH6cAiCIgsk4BEIVAZJwCIIqBVLqiBxANQFgXS0tLND4+zl08AogmIG5OSSQS1gGKwgtANAIRcQqAaAbCe6YASBWA2E6xDyeyDUl7+AKQMkDYYevm5mZHabA/Li4uUiaTsYLau8QA4gLE/hU7wajyYtv1hReDAiAOxQcHBymbzark4BkbQKom/X8dp9Npmpqasn4BIAYAYSnYp+4BBEAMUcCwNOCQsAKZnp62NtQOw8WmwT09PUo+ijaHsOMx7GppaaH6+nolH0Z10K2tLVpdXbW6UfV3mNqBdHd3U1NTk2rtlMRfW1uj2dlZAFGirkRQAJEQTWUTAFGprkRsAJEQTWUTAFGprkRsAJEQTWUTAFGprkRsAJEQTWUTAFGprkRsAJEQTWUTAFGprkRsAJEQTWUTAGHqrm8caPzQ0WC1logbeiC7X3xJm0PvUmRzh45cuki1588FAmVn9BO6P3yF9utrqGH0MtW82S8UN9RA9v/4k7InjhcJFTs/TLVXLwmJV67S7vD7tHF5pKi46fYdosdOcOOGG8j1OcqefbFEJD9Q3GCwDhqT31HklS4A8VRgfYM2Op6k3bt/BQJl58J7lPvwg5JYNccepaMry0LPqFA7hCm39+NNyp2J0172b19QysGINj5CsRtpij57musOViH0QPJQXn6J9u7dlYJSFkbrMYolrwvDAJAC+WWdEpQz7FTgECeUCpzi6YxvvqXoM6eEhqnCSgDikEzUKUE7Aw7xuHctKB5OYU3dZlNR9syQdAaAcAYTC0pXF+39c09o2Ik+3EqxVKqiB7hbYAxZkk4pbBaEM+AQofv+wTrFwylBOQNABIGwavdfe4O2pg5elO+86l99nY58/VUF0byrYsjiSFluNlXYrOHcBar7+EogUADEQ0YRGHbzoKAASBkg2+9cpM1rV0tK2QOcXW7bLEFAARAXIF4w2DrDWoeUWaf4hQIgDiA8GPZ2iNfi0Q8UACkAIgrDbrJ385eDxaPLLrEsFAB5oG6lMPJQPLZZZKAACBGVhcG2Q+bmuLu2nk55e4jqPv1IeEoceiBeX7s2zCa5MAqdstl91vfXwaEGsv/rb5TtOFk6tWXOuJGh6KmnhO9sayrMninPx103JBtXblHkice58cINZP4Hyr5wpkgkdiChEmc4FWazLzenNKa/p0jncwDiqcD6BuWePk07t1asatZGoYQzSqA4nFJ7soNiP/+EUyfc25GI2GG53dHPrKo1g/1Cw4pIXLrzO+1c+/wg7tBbFDle/EbQcjFCPWQJCau5EoBoFpzXHYDwFNJcDiCaBed1ByA8hTSXA4hmwXndAQhPIc3lAKJZcF53AMJTSHM5gGgWnNcdgPAU0lwOIJoF53UHIDyFNJcfSiCdnZ0Ui8U0SxlMd7lcjubn561gh+Y1scFIU/0o/3sgeLO12E2k7UXKYumgFoAYdg8ACIAYpoBh6cAhAGKYAoalA4cAiGEKGJYOHAIghilgWDpwCIAYpoBh6cAhAGKYAoalA4cAiGEKGJYOHAIghilgWDpwCIAYpoBh6ZQ4JB6PKzviYthnNy4d9h+1M5mMlVckkUjsG5dhiBMCEMPg/wuOfrZZ/RSywQAAAABJRU5ErkJggg==', slideRel);
	    };
		// C: Load image
    	image.src = slideRel.path;
	}

	function callbackImgToDataURLDone(inStr, slideRel){
		var intEmpty = 0;

		// STEP 1: Store base64 data for this image
		// NOTE: Trim the leading 'data:image/png;base64,' text as it is not needed (and image wont render correctly with it)
		slideRel.data = inStr.substring(inStr.indexOf(',')+1);

		// STEP 2: Call export function once all async processes have completed
		$.each(gObjPptx.slides, function(i,slide){
			$.each(slide.rels, function(i,rel){
				if ( rel.path == slideRel.path ) rel.data = inStr.substring(inStr.indexOf(',')+1);
				if ( rel.data == null || rel.data.length == 0 ) intEmpty++;
			});
		});

		// STEP 3: Continue export process
		if ( intEmpty == 0 ) doExportPresentation();
	}

	function calcEmuCellHeightForStr(cell, inIntWidthInches) {
		// FORMULA for char-per-inch: (desired chars per line) / (font size [chars-per-inch]) = (reqd print area in inches)
		var GRATIO = 2.61803398875; // "Golden Ratio"
		var intCharPerInch = -1, intCalcGratio = 0;

		// STEP 1: Calc chars-per-inch [pitch]
		// SEE: CPL Formula from http://www.pearsonified.com/2012/01/characters-per-line.php
		intCharPerInch = (120 / cell.opts.font_size);

		// STEP 2: Calc line count
		var intLineCnt = Math.floor( cell.text.length / (intCharPerInch * inIntWidthInches) );
		if (intLineCnt < 1) intLineCnt = 1; // Dont allow line count to be 0!

		// STEP 3: Calc cell height
		var intCellH = ( intLineCnt * ((cell.opts.font_size * 2) / 100) );
		if ( intLineCnt > 8 ) intCellH = (intCellH * 0.9);

		// STEP 4: Add cell padding to height
		if ( cell.opts.marginPt && Array.isArray(cell.opts.marginPt) ) {
			intCellH += (cell.opts.marginPt[0]/ONEPT*(1/72)) + (cell.opts.marginPt[2]/ONEPT*(1/72));
		}
		else if ( cell.opts.marginPt && Number.isInteger(cell.opts.marginPt) ) {
			intCellH += (cell.opts.marginPt/ONEPT*(1/72)) + (cell.opts.marginPt/ONEPT*(1/72));
		}

		// LAST: Return size
		return inch2Emu( intCellH );
	}

	function parseTextToLines(inStr, inFontSize, inWidth) {
		var U = 2.2; // Character Constant thingy
		var CPL = (inWidth / ( inFontSize/U ));
		var arrLines = [];
		var strCurrLine = '';

		// A: Remove leading/trailing space
		inStr = $.trim(inStr);

		// B: Build line array
		$.each(inStr.split('\n'), function(i,line){
			$.each(line.split(' '), function(i,word){
				if ( strCurrLine.length + word.length + 1 < CPL ) {
					strCurrLine += (word + " ");
				}
				else {
					if ( strCurrLine ) arrLines.push( strCurrLine );
					strCurrLine = (word + " ");
				}
			});
			// All words for this line have been exhausted, flush buffer to new line, clear line var
			if ( strCurrLine ) arrLines.push( $.trim(strCurrLine) + CRLF );
			strCurrLine = "";
		});

		// C: Remove trailing linebreak
		arrLines[(arrLines.length-1)] = $.trim(arrLines[(arrLines.length-1)]);

		// D: Return lines
		return arrLines;
	}

	function getShapeInfo( shapeName ) {
		if ( !shapeName ) return gObjPptxShapes.RECTANGLE;

		if ( typeof shapeName == 'object' && shapeName.name && shapeName.displayName && shapeName.avLst ) return shapeName;

		if ( gObjPptxShapes[shapeName] ) return gObjPptxShapes[shapeName];

		var objShape = gObjPptxShapes.filter(function(obj){ return obj.name == shapeName || obj.displayName; })[0];
		if ( typeof objShape !== 'undefined' && objShape != null ) return objShape;

		return gObjPptxShapes.RECTANGLE;
	}

	function getSmartParseNumber( inVal, inDir ) {
		// FIRST: Convert string numeric value if reqd
		if ( typeof inVal == 'string' && !isNaN(Number(inVal)) ) inVal = Number(inVal);

		// CASE 1: Number in inches
		// Figure any number less than 100 is inches
		if ( typeof inVal == 'number' && inVal < 100 ) return inch2Emu(inVal);

		// CASE 2: Number is already converted to something other than inches
		// Figure any number greater than 100 is not inches! :)  Just return it (its EMU already i guess??)
		if ( typeof inVal == 'number' && inVal >= 100 ) return inVal;

		// CASE 3: Percentage (ex: '50%')
		if ( typeof inVal == 'string' && inVal.indexOf('%') > -1 ) {
			if ( inDir && inDir == 'X') return Math.round( (parseInt(inVal,10) / 100) * gObjPptx.pptLayout.width  );
			if ( inDir && inDir == 'Y') return Math.round( (parseInt(inVal,10) / 100) * gObjPptx.pptLayout.height );
			// Default: Assume width (x/cx)
			return Math.round( (parseInt(inVal,10) / 100) * gObjPptx.pptLayout.width );
		}

		// LAST: Default value
		return 0;
	}

	function decodeXmlEntities( inStr ) {
		// NOTE: Dont use short-circuit eval here as value c/b "0" (zero) etc.!
		if ( typeof inStr === 'undefined' || inStr == null ) return "";
		return inStr.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\'/g,'&apos;');
	}

	/* =======================================================================================================
	|
	#     #  #     #  #             #####
	 #   #   ##   ##  #            #     #  ######  #    #  ######  #####     ##    #####  #   ####   #    #
	  # #    # # # #  #            #        #       ##   #  #       #    #   #  #     #    #  #    #  ##   #
	   #     #  #  #  #            #  ####  #####   # #  #  #####   #    #  #    #    #    #  #    #  # #  #
	  # #    #     #  #            #     #  #       #  # #  #       #####   ######    #    #  #    #  #  # #
	 #   #   #     #  #            #     #  #       #   ##  #       #   #   #    #    #    #  #    #  #   ##
	#     #  #     #  #######       #####   ######  #    #  ######  #    #  #    #    #    #   ####   #    #
	|
	=========================================================================================================
	*/

	function genXmlBodyProperties( objOptions ) {
		var bodyProperties = '<a:bodyPr';

		if ( objOptions && objOptions.bodyProp ) {
			// A: Enable or disable textwrapping none or square:
			( objOptions.bodyProp.wrap ) ? bodyProperties += ' wrap="' + objOptions.bodyProp.wrap + '" rtlCol="0"' : bodyProperties += ' wrap="square" rtlCol="0"';

			// B: Set anchorPoints bottom, center or top:
			if ( objOptions.bodyProp.anchor    ) bodyProperties += ' anchor="' + objOptions.bodyProp.anchor + '"';
			if ( objOptions.bodyProp.anchorCtr ) bodyProperties += ' anchorCtr="' + objOptions.bodyProp.anchorCtr + '"';

			// C: Textbox margins [padding]:
			if ( objOptions.bodyProp.bIns || objOptions.bodyProp.bIns == 0 ) bodyProperties += ' bIns="' + objOptions.bodyProp.bIns + '"';
			if ( objOptions.bodyProp.lIns || objOptions.bodyProp.lIns == 0 ) bodyProperties += ' lIns="' + objOptions.bodyProp.lIns + '"';
			if ( objOptions.bodyProp.rIns || objOptions.bodyProp.rIns == 0 ) bodyProperties += ' rIns="' + objOptions.bodyProp.rIns + '"';
			if ( objOptions.bodyProp.tIns || objOptions.bodyProp.tIns == 0 ) bodyProperties += ' tIns="' + objOptions.bodyProp.tIns + '"';

			// D: Close <a:bodyPr element
			bodyProperties += '>';

			// E: NEW: Add auto-fit type tags
			if ( objOptions.shrinkText ) bodyProperties += '<a:normAutofit fontScale="85000" lnSpcReduction="20000" />'; // MS-PPT > Format Shape > Text Options: "Shrink text on overflow"
			else if ( objOptions.bodyProp.autoFit !== false ) bodyProperties += '<a:spAutoFit/>'; // MS-PPT > Format Shape > Text Options: "Resize shape to fit text"

			// LAST: Close bodyProp
			bodyProperties += '</a:bodyPr>';
		}
		else {
			// DEFAULT:
			bodyProperties += ' wrap="square" rtlCol="0"></a:bodyPr>';
		}

		return bodyProperties;
	}

	function genXmlTextCommand( text_info, text_string, slide_obj, slide_num ) {
		var area_opt_data = genXmlTextData( text_info, slide_obj );
		var parsedText;
		var startInfo = '<a:rPr lang="en-US"' + area_opt_data.font_size + area_opt_data.bold + area_opt_data.underline + area_opt_data.char_spacing + ' dirty="0" smtClean="0"' + (area_opt_data.rpr_info != '' ? ('>' + area_opt_data.rpr_info) : '/>') + '<a:t>';
		var endTag = '</a:r>';
		var outData = '<a:r>' + startInfo;

		if ( text_string.field ) {
			endTag = '</a:fld>';
			var outTextField = pptxFields[text_string.field];
			if ( outTextField === null ) {
				for ( var fieldIntName in pptxFields ) {
					if ( pptxFields[fieldIntName] === text_string.field ) {
						outTextField = text_string.field;
						break;
					}
				}

				if ( outTextField === null ) outTextField = 'datetime';
			}

			outData = '<a:fld id="{' + gen_private.plugs.type.msoffice.makeUniqueID ( '5C7A2A3D' ) + '}" type="' + outTextField + '">' + startInfo;
			outData += CreateFieldText( outTextField, slide_num );

		}
		else {
			// Automatic support for newline - split it into multi-p:
			parsedText = text_string.split( "\n" );
			if ( parsedText.length > 1 ) {
				var outTextData = '';
				for ( var i = 0, total_size_i = parsedText.length; i < total_size_i; i++ ) {
					outTextData += outData + decodeXmlEntities(parsedText[i]);

					if ( (i + 1) < total_size_i ) {
						outTextData += '</a:t></a:r></a:p><a:p>';
					}
				}

				outData = outTextData;

			}
			else {
				outData += text_string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
			}
		}

		var outBreakP = '';
		if ( text_info.breakLine ) outBreakP += '</a:p><a:p>';

		return outData + '</a:t>' + endTag + outBreakP;
	}

	function genXmlTextData( text_info, slide_obj ) {
		var out_obj = {};

		out_obj.font_size = '';
		out_obj.bold = '';
		out_obj.underline = '';
		out_obj.rpr_info = '';
        out_obj.char_spacing = '';

		if ( typeof text_info == 'object' ) {
			if ( text_info.bold ) {
				out_obj.bold = ' b="1"';
			}

			if ( text_info.underline ) {
				out_obj.underline = ' u="sng"';
			}

			if ( text_info.font_size ) {
				out_obj.font_size = ' sz="' + text_info.font_size + '00"';
			}

			if ( text_info.char_spacing ) {
				out_obj.char_spacing = ' spc="' + (text_info.char_spacing * 100) + '"';
				// must also disable kerning; otherwise text won't actually expand
				out_obj.char_spacing += ' kern="0"';
			}

			if ( text_info.color ) {
				out_obj.rpr_info += genXmlColorSelection( text_info.color );
			}
			else if ( slide_obj && slide_obj.color ) {
				out_obj.rpr_info += genXmlColorSelection( slide_obj.color );
			}

			if ( text_info.font_face ) {
				out_obj.rpr_info += '<a:latin typeface="' + text_info.font_face + '" pitchFamily="34" charset="0"/><a:cs typeface="' + text_info.font_face + '" pitchFamily="34" charset="0"/>';
			}
		}
		else {
			if ( slide_obj && slide_obj.color ) out_obj.rpr_info += genXmlColorSelection ( slide_obj.color );
		}

		if ( out_obj.rpr_info != '' )
			out_obj.rpr_info += '</a:rPr>';

		return out_obj;
	}

	function genXmlColorSelection( color_info, back_info ) {
		var outText = '';
		var colorVal;
		var fillType = 'solid';
		var internalElements = '';

		if ( back_info ) {
			outText += '<p:bg><p:bgPr>';
			outText += genXmlColorSelection ( back_info, false );
			outText += '<a:effectLst/>';
			outText += '</p:bgPr></p:bg>';
		}

		if ( color_info ) {
			if ( typeof color_info == 'string' ) colorVal = color_info;
			else {
				if ( color_info.type ) fillType = color_info.type;
				if ( color_info.color ) colorVal = color_info.color;
				if ( color_info.alpha ) internalElements += '<a:alpha val="' + (100 - color_info.alpha) + '000"/>';
			}

			switch ( fillType ) {
				case 'solid':
					outText += '<a:solidFill><a:srgbClr val="' + colorVal + '">' + internalElements + '</a:srgbClr></a:solidFill>';
					break;
			}
		}

		return outText;
	}

	// XML GEN: First 6 funcs create the base /ppt files

	function makeXmlContTypes() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+CRLF
					+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
					+ ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
					+ ' <Default Extension="xml" ContentType="application/xml"/>'
					+ ' <Default Extension="jpeg" ContentType="image/jpeg"/>'
					+ ' <Default Extension="png" ContentType="image/png"/>'
					+ ' <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
					+ ' <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
					+ ' <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
					+ ' <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
					+ ' <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
					+ ' <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
					+ ' <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>';
		$.each(gObjPptx.slides, function(idx,slide){
			strXml += '<Override PartName="/ppt/slideMasters/slideMaster'+ (idx+1) +'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>';
			strXml += '<Override PartName="/ppt/slideLayouts/slideLayout'+ (idx+1) +'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>';
			strXml += '<Override PartName="/ppt/slides/slide'+ (idx+1) +'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
		});
		strXml += '</Types>';
		return strXml;
	}

	function makeXmlRootRels() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
					+ '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
					+ '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
					+ '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
					+ '</Relationships>';
		return strXml;
	}

	function makeXmlApp() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n\
					<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">\
						<TotalTime>0</TotalTime>\
						<Words>0</Words>\
						<Application>Microsoft Office PowerPoint</Application>\
						<PresentationFormat>On-screen Show (4:3)</PresentationFormat>\
						<Paragraphs>0</Paragraphs>\
						<Slides>'+ gObjPptx.slides.length +'</Slides>\
						<Notes>0</Notes>\
						<HiddenSlides>0</HiddenSlides>\
						<MMClips>0</MMClips>\
						<ScaleCrop>false</ScaleCrop>\
						<HeadingPairs>\
						  <vt:vector size="4" baseType="variant">\
						    <vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>\
						    <vt:variant><vt:i4>1</vt:i4></vt:variant>\
						    <vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>\
						    <vt:variant><vt:i4>'+ gObjPptx.slides.length +'</vt:i4></vt:variant>\
						  </vt:vector>\
						</HeadingPairs>\
						<TitlesOfParts>';
		strXml += '<vt:vector size="'+ (gObjPptx.slides.length+1) +'" baseType="lpstr">';
		strXml += '<vt:lpstr>Office Theme</vt:lpstr>';
		$.each(gObjPptx.slides, function(idx,slideObj){ strXml += '<vt:lpstr>Slide '+ (idx+1) +'</vt:lpstr>'; });
		strXml += ' </vt:vector>\
						</TitlesOfParts>\
						<Company>PptxGenJS</Company>\
						<LinksUpToDate>false</LinksUpToDate>\
						<SharedDoc>false</SharedDoc>\
						<HyperlinksChanged>false</HyperlinksChanged>\
						<AppVersion>15.0000</AppVersion>\
					</Properties>';
		return strXml;
	}

	function makeXmlCore() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n\
						<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"\
							 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"\
							 xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\
							<dc:title>'+ gObjPptx.title +'</dc:title>\
							<dc:creator>PptxGenJS</dc:creator>\
							<cp:lastModifiedBy>PptxGenJS</cp:lastModifiedBy>\
							<cp:revision>1</cp:revision>\
							<dcterms:created xsi:type="dcterms:W3CDTF">'+ new Date().toISOString() +'</dcterms:created>\
							<dcterms:modified xsi:type="dcterms:W3CDTF">'+ new Date().toISOString() +'</dcterms:modified>\
						</cp:coreProperties>';
		return strXml;
	}

	function makeXmlPresentationRels() {
		var intRelNum = 0;
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

		strXml += '  <Relationship Id="rId1" Target="slideMasters/slideMaster1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"/>';
		intRelNum++;

		for ( var idx=1; idx<=gObjPptx.slides.length; idx++ ) {
			intRelNum++;
			strXml += '  <Relationship Id="rId'+ intRelNum +'" Target="slides/slide'+ idx +'.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/>';
		}
		intRelNum++;
		strXml += '  <Relationship Id="rId'+  intRelNum    +'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>'
				+ '  <Relationship Id="rId'+ (intRelNum+1) +'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>'
				+ '  <Relationship Id="rId'+ (intRelNum+2) +'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
				+ '  <Relationship Id="rId'+ (intRelNum+3) +'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>'
				+ '</Relationships>';
		return strXml;
	}

	function makeXmlSlideLayout() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
		strXml += '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title" preserve="1">\r\n'
				+ '<p:cSld name="Title Slide">'
				+ '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
				+ '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="2130425"/><a:ext cx="7772400" cy="1470025"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
				+ '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1371600" y="3886200"/><a:ext cx="6400800" cy="1752600"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle>'
				+ '  <a:lvl1pPr marL="0"       indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr>'
				+ '  <a:lvl2pPr marL="457200"  indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl2pPr>'
				+ '  <a:lvl3pPr marL="914400"  indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl3pPr>'
				+ '  <a:lvl4pPr marL="1371600" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl4pPr>'
				+ '  <a:lvl5pPr marL="1828800" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl5pPr>'
				+ '  <a:lvl6pPr marL="2286000" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl6pPr>'
				+ '  <a:lvl7pPr marL="2743200" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl7pPr>'
				+ '  <a:lvl8pPr marL="3200400" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl8pPr>'
				+ '  <a:lvl9pPr marL="3657600" indent="0" algn="ctr"><a:buNone/><a:defRPr><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Click to edit Master subtitle style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>'
				+ '<p:cNvPr id="4" name="Date Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" sz="half" idx="10"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="{F8166F1F-CE9B-4651-A6AA-CD717754106B}" type="datetimeFigureOut"><a:rPr lang="en-US" smtClean="0"/><a:t>01/01/2016</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>'
				+ '<p:cNvPr id="5" name="Footer Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="11"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>'
				+ '<p:cNvPr id="6" name="Slide Number Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="'+SLDNUMFLDID+'" type="slidenum"><a:rPr lang="en-US" smtClean="0"/><a:t></a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld>'
				+ '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
		//
		return strXml;
	}

	// XML GEN: Next 5 run 1-N times

	/**
	 * Generates the XML slide resource from a Slide object
	 * @param {Object} inSlide - The slide object to transform into XML
	 * @return {string} strSlideXml - Slide OOXML
	*/
	function makeXmlSlide(inSlide) {
		var intTableNum = 1;
		var objSlideData = inSlide.data;

		// STEP 1: Start slide XML
		var strSlideXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
		strSlideXml += '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">';
		strSlideXml += '<p:cSld name="'+ inSlide.name +'">';

		// STEP 2: Add background color or background image (if any)
		// A: Background color
		if ( inSlide.slide.back ) strSlideXml += genXmlColorSelection(false, inSlide.slide.back);
		// B: Add background image (using Strech) (if any)
		if ( inSlide.slide.bkgdImgRid ) {
			// TODO 1.0: We should be doing this in the slideLayout...
			strSlideXml += '<p:bg>'
						+ '<p:bgPr><a:blipFill dpi="0" rotWithShape="1">'
						+ '<a:blip r:embed="rId'+ inSlide.slide.bkgdImgRid +'"><a:lum/></a:blip>'
						+ '<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>'
						+ '<a:effectLst/></p:bgPr>'
						+ '</p:bg>';
		}

		// STEP 3: Continue slide by starting spTree node
		strSlideXml += '<p:spTree>';
		strSlideXml += '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>';
		strSlideXml += '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>';
		strSlideXml += '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

		// STEP 4: Add slide numbers if selected
		// TODO 1.0: Fixed location sucks! Place near bottom corner using slide.size !!!
		if ( inSlide.hasSlideNumber ) {
			strSlideXml += '<p:sp>'
				+ '  <p:nvSpPr>'
				+ '  <p:cNvPr id="25" name="Shape 25"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum" sz="quarter" idx="4294967295"/></p:nvPr></p:nvSpPr>'
				+ '  <p:spPr>'
				+ '    <a:xfrm><a:off x="'+ (EMU*0.3) +'" y="'+ (EMU*5.2) +'"/><a:ext cx="400000" cy="300000"/></a:xfrm>'
				+ '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
				+ '    <a:extLst>'
				+ '      <a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}">'
				+ '      <ma14:wrappingTextBoxFlag val="0" xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main"/></a:ext>'
				+ '    </a:extLst>'
				+ '  </p:spPr>'
				+ '  <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr/><a:fld id="'+SLDNUMFLDID+'" type="slidenum"/></a:p></p:txBody>'
				+ '</p:sp>';
		}

		// STEP 5: Loop over all Slide objects and add them to this slide:
		$.each(objSlideData, function(idx,slideObj){
			var x = 0, y = 0, cx = (EMU*10), cy = 0;
			var moreStyles = '', moreStylesAttr = '', outStyles = '', styleData = '', locationAttr = '';
			var shapeType = null;

			// A: Set option vars
			if ( slideObj.options ) {
				if ( slideObj.options.w  || slideObj.options.w  == 0 ) slideObj.options.cx = slideObj.options.w;
				if ( slideObj.options.h  || slideObj.options.h  == 0 ) slideObj.options.cy = slideObj.options.h;
				//
				if ( slideObj.options.x  || slideObj.options.x  == 0 )  x = getSmartParseNumber( slideObj.options.x , 'X' );
				if ( slideObj.options.y  || slideObj.options.y  == 0 )  y = getSmartParseNumber( slideObj.options.y , 'Y' );
				if ( slideObj.options.cx || slideObj.options.cx == 0 ) cx = getSmartParseNumber( slideObj.options.cx, 'X' );
				if ( slideObj.options.cy || slideObj.options.cy == 0 ) cy = getSmartParseNumber( slideObj.options.cy, 'Y' );
				if ( slideObj.options.flipH  ) locationAttr += ' flipH="1"';
				if ( slideObj.options.flipV  ) locationAttr += ' flipV="1"';
				if ( slideObj.options.shape  ) shapeType = getShapeInfo( slideObj.options.shape );
				if ( slideObj.options.rotate ) {
					var rotateVal = (slideObj.options.rotate > 360) ? (slideObj.options.rotate - 360) : slideObj.options.rotate;
					rotateVal *= 60000;
					locationAttr += ' rot="' + rotateVal + '"';
				}
			}

			// B: Create this particular object on Slide
			switch ( slideObj.type ) {
				case 'table':
					var arrRowspanCells = [];
					var arrTabRows = slideObj.arrTabRows;
					var objTabOpts = slideObj.objTabOpts;
					var intColCnt = 0, intColW = 0;
					// NOTE: Cells may have a colspan, so merely taking the length of the [0] (or any other) row is not
					// ....: sufficient to determine column count. Therefore, check each cell for a colspan and total cols as reqd
					for (var tmp=0; tmp<arrTabRows[0].length; tmp++) {
						intColCnt += ( arrTabRows[0][tmp].opts && arrTabRows[0][tmp].opts.colspan ) ? Number(arrTabRows[0][tmp].opts.colspan) : 1;
					}

					// STEP 1: Start Table XML
					// NOTE: Non-numeric cNvPr id values will trigger "presentation needs repair" type warning in MS-PPT-2013
					var strXml = '<p:graphicFrame>'
							+ '  <p:nvGraphicFramePr>'
							+ '    <p:cNvPr id="'+ (intTableNum*inSlide.numb + 1) +'" name="Table '+ (intTableNum*inSlide.numb) +'"/>'
							+ '    <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>'
							+ '    <p:nvPr><p:extLst><p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}"><p14:modId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1579011935"/></p:ext></p:extLst></p:nvPr>'
							+ '  </p:nvGraphicFramePr>'
							+ '  <p:xfrm>'
							+ '    <a:off  x="'+ (x  || EMU) +'"  y="'+ (y  || EMU) +'"/>'
							+ '    <a:ext cx="'+ (cx || EMU) +'" cy="'+ (cy || EMU) +'"/>'
							+ '  </p:xfrm>'
							+ '  <a:graphic>'
							+ '    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">'
							+ '      <a:tbl>'
							+ '        <a:tblPr/>';
							// + '        <a:tblPr bandRow="1"/>';
					// TODO 1.5: Support banded rows, first/last row, etc.
					// NOTE: Banding, etc. only shows when using a table style! (or set alt row color if banding)
					// <a:tblPr firstCol="0" firstRow="0" lastCol="0" lastRow="0" bandCol="0" bandRow="1">

					// STEP 2: Set column widths
					// Evenly distribute cols/rows across size provided when applicable (calc them if only overall dimensions were provided)
					// A: Col widths provided?
					if ( Array.isArray(objTabOpts.colW) ) {
						strXml += '<a:tblGrid>';
						for ( var col=0; col<intColCnt; col++ ) {
							strXml += '  <a:gridCol w="'+ (objTabOpts.colW[col] || (slideObj.options.cx/intColCnt)) +'"/>';
						}
						strXml += '</a:tblGrid>';
					}
					// B: Table Width provided without colW? Then distribute cols
					else {
						intColW = (objTabOpts.colW) ? objTabOpts.colW : EMU;
						if ( slideObj.options.cx && !objTabOpts.colW ) intColW = ( slideObj.options.cx / intColCnt );
						strXml += '<a:tblGrid>';
						for ( var col=0; col<intColCnt; col++ ) { strXml += '<a:gridCol w="'+ intColW +'"/>'; }
						strXml += '</a:tblGrid>';
					}
					// C: Table Height provided without rowH? Then distribute rows
					var intRowH = (objTabOpts.rowH) ? inch2Emu(objTabOpts.rowH) : 0;
					if ( slideObj.options.cy && !objTabOpts.rowH ) intRowH = ( slideObj.options.cy / arrTabRows.length );

					// STEP 3: Build an array of rowspan cells now so we can add stubs in as we loop below
 					$.each(arrTabRows, function(rIdx,row){
						$(row).each(function(cIdx,cell){
							var colIdx = cIdx;
							if ( cell.opts && cell.opts.rowspan && Number.isInteger(cell.opts.rowspan) ) {
								for (idy=1; idy<cell.opts.rowspan; idy++) {
									arrRowspanCells.push( {row:(rIdx+idy), col:colIdx} );
									colIdx++; // For cases where we already have a rowspan in this row - we need to Increment to account for this extra cell!
								}
							}
						});
					});

					// STEP 4: Build table rows/cells
					$.each(arrTabRows, function(rIdx,row){
						if ( Array.isArray(objTabOpts.rowH) && objTabOpts.rowH[rIdx] ) intRowH = inch2Emu(objTabOpts.rowH[rIdx]);

						// A: Start row
						strXml += '<a:tr h="'+ intRowH +'">';

						// B: Loop over each CELL
						$(row).each(function(cIdx,cell){
							// 1: OPTIONS: Build/set cell options (blocked for code folding)
							{
								// 1: Load/Create options
								var cellOpts = cell.opts || {};

								// 2: Do Important/Override Opts
								// Feature: TabOpts Default Values (tabOpts being used when cellOpts dont exist):
								// SEE: http://officeopenxml.com/drwTableCellProperties-alignment.php
								$.each(['align','bold','border','color','fill','font_face','font_size','underline','valign'], function(i,name){
									if ( objTabOpts[name] && ! cellOpts[name]) cellOpts[name] = objTabOpts[name];
								});

								var cellB       = (cellOpts.bold)       ? ' b="1"' : ''; // [0,1] or [false,true]
								var cellU       = (cellOpts.underline)  ? ' u="sng"' : ''; // [none,sng (single), et al.]
								var cellFont    = (cellOpts.font_face)  ? ' <a:latin typeface="'+ cellOpts.font_face +'"/>' : '';
								var cellFontPt  = (cellOpts.font_size)  ? ' sz="'+ cellOpts.font_size +'00"' : '';
								var cellAlign   = (cellOpts.align)      ? ' algn="'+ cellOpts.align.replace(/^c$/i,'ctr').replace('center','ctr').replace('left','l').replace('right','r') +'"' : '';
								var cellValign  = (cellOpts.valign)     ? ' anchor="'+ cellOpts.valign.replace(/^c$/i,'ctr').replace(/^m$/i,'ctr').replace('center','ctr').replace('middle','ctr').replace('top','t').replace('btm','b').replace('bottom','b') +'"' : '';
								var cellColspan = (cellOpts.colspan)    ? ' gridSpan="'+ cellOpts.colspan +'"' : '';
								var cellRowspan = (cellOpts.rowspan)    ? ' rowSpan="'+ cellOpts.rowspan +'"' : '';
								var cellFontClr = ((cell.optImp && cell.optImp.color) || cellOpts.color) ? ' <a:solidFill><a:srgbClr val="'+ ((cell.optImp && cell.optImp.color) || cellOpts.color) +'"/></a:solidFill>' : '';
								var cellFill    = ((cell.optImp && cell.optImp.fill)  || cellOpts.fill ) ? ' <a:solidFill><a:srgbClr val="'+ ((cell.optImp && cell.optImp.fill) || cellOpts.fill) +'"/></a:solidFill>' : '';
								var intMarginPt = (cellOpts.marginPt || cellOpts.marginPt == 0) ? (cellOpts.marginPt * ONEPT) : 0;
								// Margin/Padding:
								var cellMargin  = '';
								if ( cellOpts.marginPt && Array.isArray(cellOpts.marginPt) ) {
									cellMargin = ' marL="'+ cellOpts.marginPt[3] +'" marR="'+ cellOpts.marginPt[1] +'" marT="'+ cellOpts.marginPt[0] +'" marB="'+ cellOpts.marginPt[2] +'"';
								}
								else if ( cellOpts.marginPt && Number.isInteger(cellOpts.marginPt) ) {
									cellMargin = ' marL="'+ intMarginPt +'" marR="'+ intMarginPt +'" marT="'+ intMarginPt +'" marB="'+ intMarginPt +'"';
								}
							}

							// 2: Cell Content: Either the text element or the cell itself (for when users just pass a string - no object or options)
							var strCellText = ((typeof cell === 'object') ? cell.text : cell);

							// TODO 1.5: Cell NOWRAP property (text wrap: add to a:tcPr (horzOverflow="overflow" or whatev opts exist)

							// 3: ROWSPAN: Add dummy cells for any active rowspan
							// TODO 1.5: ROWSPAN & COLSPAN in same cell is not yet handled!
							if ( arrRowspanCells.filter(function(obj){ return obj.row == rIdx && obj.col == cIdx }).length > 0 ) {
								strXml += '<a:tc vMerge="1"><a:tcPr/></a:tc>';
							}

							// 4: Start Table Cell, add Align, add Text content
							strXml += ' <a:tc'+ cellColspan + cellRowspan +'>'
									+ '  <a:txBody>'
									+ '    <a:bodyPr/>'
									+ '    <a:lstStyle/>'
									+ '    <a:p>'
									+ '      <a:pPr'+ cellAlign +'/>'
									+ '      <a:r>'
									+ '        <a:rPr lang="en-US" dirty="0" smtClean="0"'+ cellFontPt + cellB + cellU +'>'+ cellFontClr + cellFont +'</a:rPr>'
									+ '        <a:t>'+ decodeXmlEntities(strCellText) +'</a:t>'
									+ '      </a:r>'
									+ '      <a:endParaRPr lang="en-US" dirty="0"/>'
									+ '    </a:p>'
									+ '  </a:txBody>'
									+ '  <a:tcPr'+ cellMargin + cellValign +'>';

							// 5: Borders: Add any borders
							if ( cellOpts.border && typeof cellOpts.border === 'string' ) {
								strXml += '  <a:lnL w="'+ ONEPT +'" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="'+ cellOpts.border +'"/></a:solidFill></a:lnL>';
								strXml += '  <a:lnR w="'+ ONEPT +'" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="'+ cellOpts.border +'"/></a:solidFill></a:lnR>';
								strXml += '  <a:lnT w="'+ ONEPT +'" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="'+ cellOpts.border +'"/></a:solidFill></a:lnT>';
								strXml += '  <a:lnB w="'+ ONEPT +'" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="'+ cellOpts.border +'"/></a:solidFill></a:lnB>';
							}
							else if ( cellOpts.border && Array.isArray(cellOpts.border) ) {
								$.each([ {idx:3,name:'lnL'}, {idx:1,name:'lnR'}, {idx:0,name:'lnT'}, {idx:2,name:'lnB'} ], function(i,obj){
									if ( cellOpts.border[obj.idx] ) {
										var strC = '<a:solidFill><a:srgbClr val="'+ ((cellOpts.border[obj.idx].color) ? cellOpts.border[obj.idx].color : '666666') +'"/></a:solidFill>';
										var intW = (cellOpts.border[obj.idx] && (cellOpts.border[obj.idx].pt || cellOpts.border[obj.idx].pt == 0)) ? (ONEPT * Number(cellOpts.border[obj.idx].pt)) : ONEPT;
										strXml += '<a:'+ obj.name +' w="'+ intW +'" cap="flat" cmpd="sng" algn="ctr">'+ strC +'</a:'+ obj.name +'>';
									}
									else strXml += '<a:'+ obj.name +' w="0"><a:miter lim="400000" /></a:'+ obj.name +'>';
								});
							}
							else if ( cellOpts.border && typeof cellOpts.border === 'object' ) {
								var intW = (cellOpts.border && (cellOpts.border.pt || cellOpts.border.pt == 0) ) ? (ONEPT * Number(cellOpts.border.pt)) : ONEPT;
								var strClr = '<a:solidFill><a:srgbClr val="'+ ((cellOpts.border.color) ? cellOpts.border.color : '666666') +'"/></a:solidFill>';
								var strAttr = '<a:prstDash val="';
								strAttr += ((cellOpts.border.type && cellOpts.border.type.toLowerCase().indexOf('dash') > -1) ? "sysDash" : "solid" );
								strAttr += '"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/>';
								// *** IMPORTANT! *** LRTB order matters! (Reorder a line below to watch the borders go wonky in MS-PPT-2013!!)
								strXml += '<a:lnL w="'+ intW +'" cap="flat" cmpd="sng" algn="ctr">'+ strClr + strAttr +'</a:lnL>';
								strXml += '<a:lnR w="'+ intW +'" cap="flat" cmpd="sng" algn="ctr">'+ strClr + strAttr +'</a:lnR>';
								strXml += '<a:lnT w="'+ intW +'" cap="flat" cmpd="sng" algn="ctr">'+ strClr + strAttr +'</a:lnT>';
								strXml += '<a:lnB w="'+ intW +'" cap="flat" cmpd="sng" algn="ctr">'+ strClr + strAttr +'</a:lnB>';
								// *** IMPORTANT! *** LRTB order matters!
							}

							// 6: Close cell Properties & Cell
							strXml += cellFill
									+ '  </a:tcPr>'
									+ ' </a:tc>';

							// LAST: COLSPAN: Add a 'merged' col for each column being merged (SEE: http://officeopenxml.com/drwTableGrid.php)
							if ( cellOpts.colspan ) {
								for (var tmp=1; tmp<Number(cellOpts.colspan); tmp++) { strXml += '<a:tc hMerge="1"><a:tcPr/></a:tc>'; }
							}
						});

						// B-2: Handle Rowspan as last col case
						// We add dummy cells inside cell loop, but cases where last col is rowspaned
						// by prev row wont be created b/c cell loop above exhausted before the col
						// index of the final col was reached... ANYHOO, add it here when necc.
						if ( arrRowspanCells.filter(function(obj){ return obj.row == rIdx && (obj.col+1) >= $(row).length }).length > 0 ) {
							strXml += '<a:tc vMerge="1"><a:tcPr/></a:tc>';
						}

						// C: Complete row
						strXml += '</a:tr>';
					});

					// STEP 5: Complete table
					strXml += '      </a:tbl>'
							+ '    </a:graphicData>'
							+ '  </a:graphic>'
							+ '</p:graphicFrame>';

					// STEP 6: Set table XML
					strSlideXml += strXml;

					// LAST: Increment counter
					intTableNum++;
					break;

				case 'text':
					// Lines can have zero cy, but text should not
					if ( !slideObj.options.line && cy == 0 ) cy = (EMU * 0.3);

					// Margin/Padding/Inset for textboxes
					if ( slideObj.options.margin && Array.isArray(slideObj.options.margin) ) {
						slideObj.options.bodyProp.lIns = (slideObj.options.margin[0] * ONEPT || 0);
						slideObj.options.bodyProp.rIns = (slideObj.options.margin[1] * ONEPT || 0);
						slideObj.options.bodyProp.bIns = (slideObj.options.margin[2] * ONEPT || 0);
						slideObj.options.bodyProp.tIns = (slideObj.options.margin[3] * ONEPT || 0);
					}
					else if ( (slideObj.options.margin || slideObj.options.margin == 0) && Number.isInteger(slideObj.options.margin) ) {
						slideObj.options.bodyProp.lIns = (slideObj.options.margin * ONEPT);
						slideObj.options.bodyProp.rIns = (slideObj.options.margin * ONEPT);
						slideObj.options.bodyProp.bIns = (slideObj.options.margin * ONEPT);
						slideObj.options.bodyProp.tIns = (slideObj.options.margin * ONEPT);
					}

					var effectsList = '';
					if ( shapeType == null ) shapeType = getShapeInfo(null);

					// A: Start Shape
					strSlideXml += '<p:sp>';

					// B: The addition of the "txBox" attribute is the sole determiner of if an object is a Shape or Textbox
					strSlideXml += '<p:nvSpPr><p:cNvPr id="'+ (idx+2) +'" name="Object '+ (idx+1) +'"/>';
					strSlideXml += '<p:cNvSpPr' + ((slideObj.options && slideObj.options.isTextBox) ? ' txBox="1"/><p:nvPr/>' : '/><p:nvPr/>');
					strSlideXml += '</p:nvSpPr>';
					strSlideXml += '<p:spPr><a:xfrm' + locationAttr + '>';
					strSlideXml += '<a:off x="'  + x  + '" y="'  + y  + '"/>';
					strSlideXml += '<a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>';
					strSlideXml += '<a:prstGeom prst="' + shapeType.name + '"><a:avLst/></a:prstGeom>';

					if ( slideObj.options ) {
						( slideObj.options.fill )
							? strSlideXml += genXmlColorSelection(slideObj.options.fill) : strSlideXml += '<a:noFill/>';

						if ( slideObj.options.line ) {
							var lineAttr = '';
							if ( slideObj.options.line_size ) lineAttr += ' w="' + (slideObj.options.line_size * ONEPT) + '"';
							strSlideXml += '<a:ln' + lineAttr + '>';
							strSlideXml += genXmlColorSelection( slideObj.options.line );
							if ( slideObj.options.line_head ) strSlideXml += '<a:headEnd type="' + slideObj.options.line_head + '"/>';
							if ( slideObj.options.line_tail ) strSlideXml += '<a:tailEnd type="' + slideObj.options.line_tail + '"/>';
							strSlideXml += '</a:ln>';
						}
					}
					else {
						strSlideXml += '<a:noFill/>';
					}

					if ( slideObj.options.effects ) {
						for ( var ii = 0, total_size_ii = slideObj.options.effects.length; ii < total_size_ii; ii++ ) {
							switch ( slideObj.options.effects[ii].type ) {
								case 'outerShadow':
									effectsList += cbGenerateEffects( slideObj.options.effects[ii], 'outerShdw' );
									break;
								case 'innerShadow':
									effectsList += cbGenerateEffects( slideObj.options.effects[ii], 'innerShdw' );
									break;
							}
						}
					}

					if ( effectsList ) strSlideXml += '<a:effectLst>' + effectsList + '</a:effectLst>';

					// TODO 1.5: Text wrapping (copied from MS-PPTX export)
					/*
					// Commented out b/c i'm not even sure this works - current code produces text that wraps in shapes and textboxes, so...
					if ( slideObj.options.textWrap ) {
						strSlideXml += '<a:extLst>'
									+ '<a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}">'
									+ '<ma14:wrappingTextBoxFlag xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main" val="1" />'
									+ '</a:ext>'
									+ '</a:extLst>';
					}
					*/

					// B: Close Shape
					strSlideXml += '</p:spPr>';

					if ( slideObj.options ) {
						if ( slideObj.options.align ) {
							switch ( slideObj.options.align ) {
								case 'right':
									moreStylesAttr += ' algn="r"';
									break;
								case 'center':
									moreStylesAttr += ' algn="ctr"';
									break;
								case 'justify':
									moreStylesAttr += ' algn="just"';
									break;
							}
						}

						if ( slideObj.options.indentLevel > 0 ) moreStylesAttr += ' lvl="' + slideObj.options.indentLevel + '"';
					}

					if ( moreStyles != '' ) outStyles = '<a:pPr' + moreStylesAttr + '>' + moreStyles + '</a:pPr>';
					else if ( moreStylesAttr != '' ) outStyles = '<a:pPr' + moreStylesAttr + '/>';

					if ( styleData != '' ) strSlideXml += '<p:style>' + styleData + '</p:style>';

					if ( typeof slideObj.text == 'string' ) {
						strSlideXml += '<p:txBody>' + genXmlBodyProperties( slideObj.options ) + '<a:lstStyle/><a:p>' + outStyles;
						strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text, inSlide.slide, inSlide.slide.getPageNumber() );
					}
					else if ( typeof slideObj.text == 'number' ) {
						strSlideXml += '<p:txBody>' + genXmlBodyProperties( slideObj.options ) + '<a:lstStyle/><a:p>' + outStyles;
						strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text + '', inSlide.slide, inSlide.slide.getPageNumber() );
					}
					else if ( slideObj.text && slideObj.text.length ) {
						var outBodyOpt = genXmlBodyProperties( slideObj.options );
						strSlideXml += '<p:txBody>' + outBodyOpt + '<a:lstStyle/><a:p>' + outStyles;

						for ( var j = 0, total_size_j = slideObj.text.length; j < total_size_j; j++ ) {
							if ( (typeof slideObj.text[j] == 'object') && slideObj.text[j].text ) {
								strSlideXml += genXmlTextCommand( slideObj.text[j].options || slideObj.options, slideObj.text[j].text, inSlide.slide, outBodyOpt, outStyles, inSlide.slide.getPageNumber() );
							}
							else if ( typeof slideObj.text[j] == 'string' ) {
								strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text[j], inSlide.slide, outBodyOpt, outStyles, inSlide.slide.getPageNumber() );
							}
							else if ( typeof slideObj.text[j] == 'number' ) {
								strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text[j] + '', inSlide.slide, outBodyOpt, outStyles, inSlide.slide.getPageNumber() );
							}
							else if ( (typeof slideObj.text[j] == 'object') && slideObj.text[j].field ) {
								strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text[j], inSlide.slide, outBodyOpt, outStyles, inSlide.slide.getPageNumber() );
							}
						}
					}
					else if ( (typeof slideObj.text == 'object') && slideObj.text.field ) {
						strSlideXml += '<p:txBody>' + genXmlBodyProperties( slideObj.options ) + '<a:lstStyle/><a:p>' + outStyles;
						strSlideXml += genXmlTextCommand( slideObj.options, slideObj.text, inSlide.slide, inSlide.slide.getPageNumber() );
					}

					// We must add that at the end of every paragraph with text:
					if ( typeof slideObj.text !== 'undefined' ) {
						var font_size = '';
						if ( slideObj.options && slideObj.options.font_size ) font_size = ' sz="' + slideObj.options.font_size + '00"';
						strSlideXml += '<a:endParaRPr lang="en-US" '+ font_size +' dirty="0"/></a:p></p:txBody>';
					}

					strSlideXml += (slideObj.type == 'cxn') ? '</p:cxnSp>' : '</p:sp>';
					break;

				case 'image':
			        strSlideXml += '<p:pic>\r\n';
					strSlideXml += '  <p:nvPicPr><p:cNvPr id="'+ (idx + 2) +'" name="Object '+ (idx + 1) +'" descr="'+ slideObj.image +'"/>\r\n';
			        strSlideXml += '  <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>';
					strSlideXml += '<p:blipFill><a:blip r:embed="rId' + slideObj.imageRid + '" cstate="print"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>';
					strSlideXml += '<p:spPr>'
					strSlideXml += ' <a:xfrm' + locationAttr + '>'
					strSlideXml += '  <a:off  x="' + x  + '"  y="' + y  + '"/>'
					strSlideXml += '  <a:ext cx="' + cx + '" cy="' + cy + '"/>'
					strSlideXml += ' </a:xfrm>'
					strSlideXml += ' <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
					strSlideXml += '</p:spPr>\r\n';
					strSlideXml += '</p:pic>\r\n';
					break;
			}
		});

		// STEP 6: Close spTree and finalize slide XML
		strSlideXml += '</p:spTree>';
		strSlideXml += '</p:cSld>';
		strSlideXml += '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
		strSlideXml += '</p:sld>';

		// LAST: Return
		return strSlideXml;
	}

	function makeXmlSlideLayoutRel(inSlideNum) {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
			strXml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n';
			//?strXml += '  <Relationship Id="rId'+ inSlideNum +'" Target="../slideMasters/slideMaster'+ inSlideNum +'.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"/>';
			//strXml += '  <Relationship Id="rId1" Target="../slideMasters/slideMaster'+ inSlideNum +'.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"/>';
			strXml += '  <Relationship Id="rId1" Target="../slideMasters/slideMaster1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"/>\r\n';
			strXml += '</Relationships>';
		//
		return strXml;
	}

	function makeXmlSlideRel(inSlideNum) {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n'
					+ '  <Relationship Id="rId1" Target="../slideLayouts/slideLayout'+ inSlideNum +'.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"/>\r\n';

		// Add any IMAGEs for this Slide
		for ( var idx=0; idx<gObjPptx.slides[inSlideNum-1].rels.length; idx++ ) {
			strXml += '  <Relationship Id="rId'+ gObjPptx.slides[inSlideNum-1].rels[idx].rId +'" Target="'+ gObjPptx.slides[inSlideNum-1].rels[idx].Target +'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>\r\n';
		}

		strXml += '</Relationships>';
		//
		return strXml;
	}

	function makeXmlSlideMaster() {
		var intSlideLayoutId = 2147483649;
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\r\n'
					+ '  <p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr>\r\n'
					+ '<p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>\r\n'
					+ '<p:cNvPr id="3" name="Text Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="4525963"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl="2"/><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl="3"/><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl="4"/><a:r><a:rPr lang="en-US" smtClean="0"/><a:t>Fifth level</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>\r\n'
					+ '<p:cNvPr id="4" name="Date Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" sz="half" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="6356350"/><a:ext cx="2133600" cy="365125"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{F8166F1F-CE9B-4651-A6AA-CD717754106B}" type="datetimeFigureOut"><a:rPr lang="en-US" smtClean="0"/><a:t>12/25/2015</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>\r\n'
					+ '<p:cNvPr id="5" name="Footer Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3124200" y="6356350"/><a:ext cx="2895600" cy="365125"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr>\r\n'
					+ '<p:cNvPr id="6" name="Slide Number Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="6553200" y="6356350"/><a:ext cx="2133600" cy="365125"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:fld id="'+SLDNUMFLDID+'" type="slidenum"><a:rPr lang="en-US" smtClean="0"/><a:t></a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\r\n'
					+ '<p:sldLayoutIdLst>\r\n';
		// Create a sldLayout for each SLIDE
		for ( var idx=1; idx<=gObjPptx.slides.length; idx++ ) {
			strXml += ' <p:sldLayoutId id="'+ intSlideLayoutId +'" r:id="rId'+ idx +'"/>\r\n'
			intSlideLayoutId++;
		}
		strXml += '</p:sldLayoutIdLst>\r\n'
					+ '<p:txStyles>\r\n'
					+ ' <p:titleStyle>\r\n'
					+ '  <a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>\r\n'
					+ ' </p:titleStyle>'
					+ ' <p:bodyStyle>\r\n'
					+ '  <a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="3200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>'
					+ '  <a:lvl2pPr marL="742950" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>'
					+ '  <a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>'
					+ '  <a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>'
					+ '  <a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>'
					+ '  <a:lvl6pPr marL="2514600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>'
					+ '  <a:lvl7pPr marL="2971800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>'
					+ '  <a:lvl8pPr marL="3429000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>'
					+ '  <a:lvl9pPr marL="3886200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="?"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>'
					+ ' </p:bodyStyle>\r\n'
					+ ' <p:otherStyle>\r\n'
					+ '  <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>'
					+ '  <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>'
					+ '  <a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>'
					+ '  <a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>'
					+ '  <a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>'
					+ '  <a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>'
					+ '  <a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>'
					+ '  <a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>'
					+ '  <a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>'
					+ '  <a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>'
					+ ' </p:otherStyle>\r\n'
					+ '</p:txStyles>\r\n'
					+ '</p:sldMaster>';
		//
		return strXml;
	}

	function makeXmlSlideMasterRel() {
		// TODO 1.1: create a slideLayout for each SLDIE
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n';
		for ( var idx=1; idx<=gObjPptx.slides.length; idx++ ) {
			strXml += '  <Relationship Id="rId'+ idx +'" Target="../slideLayouts/slideLayout'+ idx +'.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"/>\r\n';
		}
		strXml += '  <Relationship Id="rId'+ (gObjPptx.slides.length+1) +'" Target="../theme/theme1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"/>\r\n';
		strXml += '</Relationships>';
		//
		return strXml;
	}

	// XML GEN: Last 5 are root /ppt files

	function makeXmlTheme() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n\
						<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">\
						<a:themeElements>\
						  <a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>\
						  <a:dk2><a:srgbClr val="1F497D"/></a:dk2>\
						  <a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3>\
						  <a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5>\
						  <a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="MS P????"/><a:font script="Hang" typeface="?? ??"/><a:font script="Hans" typeface="??"/><a:font script="Hant" typeface="????"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Angsana New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="MS P????"/><a:font script="Hang" typeface="?? ??"/><a:font script="Hans" typeface="??"/><a:font script="Hant" typeface="????"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Cordia New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/>\
						  </a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig></a:scene3d><a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/>\
						</a:theme>';
		return strXml;
	}

	function makeXmlPresentation() {
		var intCurPos = 0;
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">\r\n';

		// STEP 1: Build SLIDE master list
		strXml += '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>\r\n';
		strXml += '<p:sldIdLst>\r\n';
		for ( var idx=0; idx<gObjPptx.slides.length; idx++ ) {
			strXml += '<p:sldId id="' + (idx + 256) + '" r:id="rId' + (idx + 2) + '"/>\r\n';
		}
		strXml += '</p:sldIdLst>\r\n';

		// STEP 2: Build SLIDE text styles
		strXml += '<p:sldSz cx="'+ gObjPptx.pptLayout.width +'" cy="'+ gObjPptx.pptLayout.height +'" type="'+ gObjPptx.pptLayout.name +'"/>\r\n'
				+ '<p:notesSz cx="'+ gObjPptx.pptLayout.height +'" cy="' + gObjPptx.pptLayout.width + '"/>'
				+ '<p:defaultTextStyle>';
				+ '  <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>';
		for ( var idx=1; idx<10; idx++ ) {
			strXml += '  <a:lvl' + idx + 'pPr marL="' + intCurPos + '" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">'
					+ '    <a:defRPr sz="1800" kern="1200">'
					+ '      <a:solidFill><a:schemeClr val="tx1"/></a:solidFill>'
					+ '      <a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>'
					+ '    </a:defRPr>'
					+ '  </a:lvl' + idx + 'pPr>';
			intCurPos += 457200;
		}
		strXml += '</p:defaultTextStyle>\r\n';

		strXml += '<p:extLst><p:ext uri="{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"><p15:sldGuideLst xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"/></p:ext></p:extLst>\r\n'
				+ '</p:presentation>';
		//
		return strXml;
	}

	function makeXmlPresProps() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\r\n'
					+ '  <p:extLst>\r\n'
					+ '    <p:ext uri="{E76CE94A-603C-4142-B9EB-6D1370010A27}"><p14:discardImageEditData xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="0"/></p:ext>\r\n'
					+ '    <p:ext uri="{D31A062A-798A-4329-ABDD-BBA856620510}"><p14:defaultImageDpi xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="220"/></p:ext>\r\n'
					+ '    <p:ext uri="{FD5EFAAD-0ECE-453E-9831-46B23BE46B34}"><p15:chartTrackingRefBased xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main" val="1"/></p:ext>\r\n'
					+ '  </p:extLst>\r\n'
					+ '</p:presentationPr>';
		return strXml;
	}

	function makeXmlTableStyles() {
		// SEE: http://openxmldeveloper.org/discussions/formats/f/13/p/2398/8107.aspx
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>';
		return strXml;
	}

	function makeXmlViewProps() {
		var strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
					+ '<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
					+ '<p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>'
					+ '<p:slideViewPr>'
					+ '  <p:cSldViewPr>'
					+ '    <p:cViewPr varScale="1"><p:scale><a:sx n="64" d="100"/><a:sy n="64" d="100"/></p:scale><p:origin x="-1392" y="-96"/></p:cViewPr>'
					+ '    <p:guideLst><p:guide orient="horz" pos="2160"/><p:guide pos="2880"/></p:guideLst>'
					+ '  </p:cSldViewPr>'
					+ '</p:slideViewPr>'
					+ '<p:notesTextViewPr>'
					+ '  <p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>'
					+ '</p:notesTextViewPr>'
					+ '<p:gridSpacing cx="78028800" cy="78028800"/>'
					+ '</p:viewPr>';
		return strXml;
	}

	/* ===============================================================================================
	|
	######                                             #     ######   ###
    #     #  #    #  #####   #       #   ####         # #    #     #   #
    #     #  #    #  #    #  #       #  #    #       #   #   #     #   #
    ######   #    #  #####   #       #  #           #     #  ######    #
    #        #    #  #    #  #       #  #           #######  #         #
    #        #    #  #    #  #       #  #    #      #     #  #         #
    #         ####   #####   ######  #   ####       #     #  #        ###
	|
	==================================================================================================
	*/

	// Expose a couple private helper functions from above
	this.inch2Emu = inch2Emu;
	this.rgbToHex = rgbToHex;

	/**
	 * Gets the version of this library
	 */
	this.getVersion = function getVersion() {
		return APP_VER;
	};

	/**
	 * Sets the Presentation's Title
	 */
	this.setTitle = function setTitle(inStrTitle) {
		gObjPptx.title = inStrTitle || 'PptxGenJs Presentation';
	};

	/**
	 * Sets the Presentation's Slide Layout {object}: [screen4x3, screen16x9, widescreen]
	 * @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
	 * @param {string} a const name from LAYOUTS variable
	 */
	this.setLayout = function setLayout(inLayout) {
		if ( $.inArray(inLayout, Object.keys(LAYOUTS)) > -1 ) {
			gObjPptx.pptLayout = LAYOUTS[inLayout];
		}
		else {
			try { console.warn('UNKNOWN LAYOUT! Valid values = ' + Object.keys(LAYOUTS)); } catch(ex){}
		}
	}

	/**
	 * Gets the Presentation's Slide Layout {object}: [screen4x3, screen16x9, widescreen]
	 */
	this.getLayout = function getLayout() {
		return gObjPptx.pptLayout;
	};

	/**
	 * Export the Presentation to an .pptx file
	 * @param {string} [inStrExportName] - Filename to use for the export
	 */
	this.save = function save(inStrExportName) {
		var intRels = 0, arrImages = [];

		// STEP 1: Set export title (if any)
		if ( inStrExportName ) gObjPptx.fileName = inStrExportName;

		// STEP 2: Total all images (rels) across the Presentation
		// PERF: Only send unique image paths for encoding (encoding func will find and fill ALL matching img paths and fill)
		$.each(gObjPptx.slides, function(i,slide){
			$.each(slide.rels, function(i,rel){
				intRels++;
				if ( !rel.data && $.inArray(rel.path, arrImages) == -1 ) {
					convertImgToDataURLviaCanvas(rel, callbackImgToDataURLDone);
					arrImages.push(rel.path);
				}
			});
		});

		// STEP 3: Export now if there's no images to encode (otherwise, last async imgConvert call above will call exportFile)
		if ( intRels == 0 ) doExportPresentation();
	};

	/**
	 * Add a new Slide to the Presentation
	 * @returns {Object[]} slideObj - The new Slide object
	 */
	this.addNewSlide = function addNewSlide(inMaster) {
		var slideObj = {};
		var slideNum = gObjPptx.slides.length;
		var slideObjNum = 0;
		var pageNum  = (slideNum + 1);

		// A: Add this SLIDE to PRESENTATION, Add default values as well
		gObjPptx.slides[slideNum] = {};
		gObjPptx.slides[slideNum].slide = slideObj;
		gObjPptx.slides[slideNum].name = 'Slide ' + pageNum;
		gObjPptx.slides[slideNum].numb = pageNum;
		gObjPptx.slides[slideNum].data = [];
		gObjPptx.slides[slideNum].rels = [];
		gObjPptx.slides[slideNum].hasSlideNumber = false;

		// ==========================================================================
		// SLIDE METHODS:
		// ==========================================================================

		slideObj.hasSlideNumber = function( inBool ) {
			if ( inBool ) gObjPptx.slides[slideNum].hasSlideNumber = inBool;
			else return gObjPptx.slides[slideNum].hasSlideNumber;
		};

		slideObj.getPageNumber = function() {
			return pageNum;
		};

		slideObj.addTable = function( arrTabRows, inOpt, tabOpt ) {
			var opt = (typeof inOpt === 'object') ? inOpt : {};
			if (opt.w) opt.cx = opt.w;
			if (opt.h) opt.cy = opt.h;

			// STEP 1: REALITY-CHECK
			if ( arrTabRows == null || arrTabRows.length == 0 || ! Array.isArray(arrTabRows) ) {
				try { console.warn('[warn] addTable: Array expected!'); } catch(ex){}
				return null;
			}

			// STEP 2: Grab Slide object count
			slideObjNum = gObjPptx.slides[slideNum].data.length;

			// STEP 3: Set default options if needed
			if ( typeof opt.x  === 'undefined' ) opt.x  = (EMU / 2);
			if ( typeof opt.y  === 'undefined' ) opt.y  = EMU;
			if ( typeof opt.cx === 'undefined' ) opt.cx = (gObjPptx.pptLayout.width - (EMU / 2));
			// Dont do this for cy - leaving it null triggers auto-rowH in makeXMLSlide function

			// STEP 4: We use different logic in makeSlide (smartCalc is not used), so convert to EMU now
			if ( opt.x  < 20 ) opt.x  = inch2Emu(opt.x);
			if ( opt.y  < 20 ) opt.y  = inch2Emu(opt.y);
			if ( opt.w  < 20 ) opt.w  = inch2Emu(opt.w);
			if ( opt.h  < 20 ) opt.h  = inch2Emu(opt.h);
			if ( opt.cx < 20 ) opt.cx = inch2Emu(opt.cx);
			if ( opt.cy && opt.cy < 20 ) opt.cy = inch2Emu(opt.cy);
			//
			if ( tabOpt && Array.isArray(tabOpt.colW) ) {
				$.each(tabOpt.colW, function(i,colW){ if ( colW < 20 ) tabOpt.colW[i] = inch2Emu(colW); });
			}

			// Handle case where user passed in a simple array
			var arrTemp = $.extend(true,[],arrTabRows);
			if ( ! Array.isArray(arrTemp[0]) ) arrTemp = [ $.extend(true,[],arrTabRows) ];

			// STEP 5: Add data
			// NOTE: Use extend to avoid mutation
			gObjPptx.slides[slideNum].data[slideObjNum] = {
				type:       'table',
				arrTabRows: arrTemp,
				options:    $.extend(true,{},opt),
				objTabOpts: ($.extend(true,{},tabOpt) || {})
			};

			// LAST: Return this Slide object
			return this;
		};

		slideObj.addText = function( text, opt ) {
			// STEP 1: Grab Slide object count
			slideObjNum = gObjPptx.slides[slideNum].data.length;

			// ROBUST: Convert attr values that will likely be passed by users to valid OOXML values
			if ( opt.valign ) opt.valign = opt.valign.toLowerCase().replace(/^c.*/i,'ctr').replace(/^m.*/i,'ctr').replace(/^t.*/i,'t').replace(/^b.*/i,'b');
			if ( opt.align  ) opt.align  = opt.align.toLowerCase().replace(/^c.*/i,'center').replace(/^m.*/i,'center').replace(/^l.*/i,'left').replace(/^r.*/i,'right');

			// STEP 2: Set props
			gObjPptx.slides[slideNum].data[slideObjNum] = {};
			gObjPptx.slides[slideNum].data[slideObjNum].type = 'text';
			gObjPptx.slides[slideNum].data[slideObjNum].text = text;
			gObjPptx.slides[slideNum].data[slideObjNum].options = (typeof opt === 'object') ? opt : {};
			gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp = {};
			gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.autoFit = (opt.autoFit || false); // If true, shape will collapse to text size (Fit To Shape)
			gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.anchor = (opt.valign || 'ctr'); // VALS: [t,ctr,b]
			if ( (opt.inset && !isNaN(Number(opt.inset))) || opt.inset == 0 ) {
				gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.lIns = inch2Emu(opt.inset);
				gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.rIns = inch2Emu(opt.inset);
				gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.tIns = inch2Emu(opt.inset);
				gObjPptx.slides[slideNum].data[slideObjNum].options.bodyProp.bIns = inch2Emu(opt.inset);
			}

			// LAST: Return
			return this;
		};

		slideObj.addShape = function( shape, opt ) {
			// STEP 1: Grab Slide object count
			slideObjNum = gObjPptx.slides[slideNum].data.length;

			// STEP 2: Set props
			gObjPptx.slides[slideNum].data[slideObjNum] = {};
			gObjPptx.slides[slideNum].data[slideObjNum].type = 'text';
			gObjPptx.slides[slideNum].data[slideObjNum].options = (typeof opt == 'object') ? opt : {};
			gObjPptx.slides[slideNum].data[slideObjNum].options.shape = shape;

			// LAST: Return
			return this;
		};

		slideObj.addImage = function( strImagePath, intPosX, intPosY, intSizeX, intSizeY, strImgData ) {
			var intRels = 1;

			// REALITY-CHECK:
			if ( strImagePath == null || strImagePath == '' || strImagePath.indexOf('.') == -1 ) {
				try { console.error('ERROR: Image needs an extension/Cant be blank'); } catch(ex){}
				return null;
			}

			// STEP 1: Set vars for this Slide
			var slideObjNum = gObjPptx.slides[slideNum].data.length;
			var slideObjRels = gObjPptx.slides[slideNum].rels;
			var strImgExtn = 'png'; // Every image is encoded via canvas>base64, so they all come out as png (use of another extn will cause "needs repair" dialog on open in PPT)
			//
			gObjPptx.slides[slideNum].data[slideObjNum]       = {};
			gObjPptx.slides[slideNum].data[slideObjNum].type  = 'image';
			gObjPptx.slides[slideNum].data[slideObjNum].image = strImagePath;

			// STEP 2: Set image properties & options
			// TODO 1.1: Measure actual image when no intSizeX/intSizeY params passed
			// ....: This is an async process: we need to make getSizeFromImage use callback, then set H/W...
			// if ( !intSizeX || !intSizeY ) { var imgObj = getSizeFromImage(strImagePath);
			var imgObj = { width:1, height:1 };
			gObjPptx.slides[slideNum].data[slideObjNum].options    = {};
			gObjPptx.slides[slideNum].data[slideObjNum].options.x  = (intPosX  || 0);
			gObjPptx.slides[slideNum].data[slideObjNum].options.y  = (intPosY  || 0);
			gObjPptx.slides[slideNum].data[slideObjNum].options.cx = (intSizeX || imgObj.width );
			gObjPptx.slides[slideNum].data[slideObjNum].options.cy = (intSizeY || imgObj.height);

			// STEP 3: Add this image to this Slide Rels (rId/rels count spans all slides! Count all images to get next rId)
			// NOTE: rId starts at 2 (hence the intRels+1 below) as slideLayout.xml is rId=1!
			$.each(gObjPptx.slides, function(i,slide){ intRels += slide.rels.length; });
			slideObjRels.push({
				path: strImagePath,
				type: 'image/'+strImgExtn,
				extn: strImgExtn,
				data: (strImgData || ''),
				rId: (intRels+1),
				Target: '../media/image' + intRels + '.' + strImgExtn
			});
			gObjPptx.slides[slideNum].data[slideObjNum].imageRid = slideObjRels[slideObjRels.length-1].rId;

			// LAST: Return this Slide
			return this;
		};

		// ==========================================================================
		// POST-METHODS:
		// ==========================================================================

		// C: Add 'Master Slide' attr to Slide if a valid master was provided
		if ( inMaster && this.masters ) {
			// A: Add images (do this before adding slide bkgd)
			if ( inMaster.images && inMaster.images.length > 0 ) {
				$.each(inMaster.images, function(i,image){
					slideObj.addImage( image.src, inch2Emu(image.x), inch2Emu(image.y), inch2Emu(image.cx), inch2Emu(image.cy), (image.data || '') );
				});
			}

			// B: Add any Slide BAckground: Image or Fill
			if ( inMaster.bkgd && inMaster.bkgd.src ) {
				var slideObjRels = gObjPptx.slides[slideNum].rels;
				var strImgExtn = inMaster.bkgd.src.substring( inMaster.bkgd.src.indexOf('.')+1 ).toLowerCase();
				if ( strImgExtn == 'jpg' ) strImgExtn = 'jpeg';
				if ( strImgExtn == 'gif' ) strImgExtn = 'png'; // MS-PPT: canvas.toDataURL for gif comes out image/png, and PPT will show "needs repair" unless we do this
				// TODO 1.5: The next few lines are copies from .addImage above. A bad idea thats already bit my once! So of course it's makred as future :)
				var intRels = 1;
				for ( var idx=0; idx<gObjPptx.slides.length; idx++ ) { intRels += gObjPptx.slides[idx].rels.length; }
				slideObjRels.push({
					path: inMaster.bkgd.src,
					type: 'image/'+strImgExtn,
					extn: strImgExtn,
					data: (inMaster.bkgd.data || ''),
					rId: (intRels+1),
					Target: '../media/image' + intRels + '.' + strImgExtn
				});
				slideObj.bkgdImgRid = slideObjRels[slideObjRels.length-1].rId;
			}
			else if ( inMaster.bkgd ) {
				slideObj.back = inMaster.bkgd;
			}

			// C: Add shapes
			if ( inMaster.shapes && inMaster.shapes.length > 0 ) {
				$.each(inMaster.shapes, function(i,shape){
					// 1: Grab all options (x, y, color, etc.)
					var objOpts = {};
					$.each(Object.keys(shape), function(i,key){ if ( shape[key] != 'type' ) objOpts[key] = shape[key]; });
					// 2: Create object using 'type'
					if ( shape.type == 'text' ) slideObj.addText(shape.text, objOpts);
					else if ( shape.type == 'line' ) slideObj.addShape(gObjPptxShapes.LINE, objOpts);
				});
			}

			// D: Slide Number
			if ( typeof inMaster.isNumbered !== 'undefined' ) slideObj.hasSlideNumber(inMaster.isNumbered);
		}

		// LAST: Return this Slide to allow command chaining
		return slideObj;
	};

	/**
	 * Reproduces an HTML table as a PowerPoint table - including column widths, style, etc. - creates 1 or more slides as needed
	 * "Auto-Paging is the future!" --Elon Musk
	 * @param {string} tabEleId - The HTML Element ID of the table
	 * @param {Array} opts - An array of options (e.g.: tabsize)
	 */
	this.addSlidesForTable = function addSlidesForTable(tabEleId,inOpts) {
		var api = this;
		var opts = (inOpts || {});
		var arrObjTabHeadRows = [], arrObjTabBodyRows = [], arrObjTabFootRows = [];
		var arrObjSlides = [], arrRows = [], arrColW = [], arrTabColW = [];
		var intTabW = 0, emuTabCurrH = 0;

		// NOTE: Look for opts.margin first as user can override Slide Master settings if they want
		var arrInchMargins = [0.5, 0.5, 0.5, 0.5]; // TRBL-style
		if ( opts && opts.margin ) {
			if ( Array.isArray(opts.margin) ) arrInchMargins = opts.margin;
			else if ( !isNaN(opts.margin) ) arrInchMargins = [opts.margin, opts.margin, opts.margin, opts.margin];
		}
		else if ( opts && opts.master && opts.master.margin && gObjPptxMasters) {
			if ( Array.isArray(opts.master.margin) ) arrInchMargins = opts.master.margin;
			else if ( !isNaN(opts.master.margin) ) arrInchMargins = [opts.master.margin, opts.master.margin, opts.master.margin, opts.master.margin];
		}
		var emuSlideTabW = (gObjPptx.pptLayout.width  - inch2Emu(arrInchMargins[1] + arrInchMargins[3]));
		var emuSlideTabH = (gObjPptx.pptLayout.height - inch2Emu(arrInchMargins[0] + arrInchMargins[2]));

		// STEP 1: Grab overall table style/col widths
		$.each(['thead','tbody','tfoot'], function(i,val){
			if ( $('#'+tabEleId+' '+val+' tr').length > 0 ) {
				$('#'+tabEleId+' '+val+' tr:first-child').find('th, td').each(function(i,cell){
					// TODO 1.5: This is a hack - guessing at col widths when colspan
					if ( $(this).attr('colspan') ) {
						for (var idx=0; idx<$(this).attr('colspan'); idx++ ) {
							arrTabColW.push( Math.round($(this).outerWidth()/$(this).attr('colspan')) );
						}
					}
					else {
						arrTabColW.push( $(this).outerWidth() );
					}
				});
				return false; // break out of .each loop
			}
		});
		$.each(arrTabColW, function(i,colW){ intTabW += colW; });

		// STEP 2: Calc/Set column widths by using same column width percent from HTML table
		$.each(arrTabColW, function(i,colW){
			( $('#'+tabEleId+' thead tr:first-child th:nth-child('+ (i+1) +')').data('pptx-min-width') )
				? arrColW.push( inch2Emu( $('#'+tabEleId+' thead tr:first-child th:nth-child('+ (i+1) +')').data('pptx-min-width') ) )
				: arrColW.push( Math.round( (emuSlideTabW * (colW / intTabW * 100) ) / 100 ) );
		});

		// STEP 3: Iterate over each table element and create data arrays (text and opts)
		// NOTE: We create 3 arrays instead of one so we can loop over body then show header/footer rows on first and last page
		$.each(['thead','tbody','tfoot'], function(i,val){
			$('#'+tabEleId+' '+val+' tr').each(function(i,row){
				var arrObjTabCells = [];
				$(row).find('th, td').each(function(i,cell){
					// A: Covert colors to Hex from RGB
					var arrRGB1 = [];
					var arrRGB2 = [];
					arrRGB1 = $(cell).css('color').replace(/\s+/gi,'').replace('rgb(','').replace(')','').split(',');
					arrRGB2 = $(cell).css('background-color').replace(/\s+/gi,'').replace('rgb(','').replace(')','').split(',');

					// B: Create option object
					var objOpts = {
						font_size: $(cell).css('font-size').replace(/\D/gi,''),
						bold:       (( $(cell).css('font-weight') == "bold" || Number($(cell).css('font-weight')) >= 500 ) ? true : false),
						color:      rgbToHex( Number(arrRGB1[0]), Number(arrRGB1[1]), Number(arrRGB1[2]) ),
						fill:       rgbToHex( Number(arrRGB2[0]), Number(arrRGB2[1]), Number(arrRGB2[2]) )
					};
					if ( $.inArray($(cell).css('text-align'), ['left','center','right','start','end']) > -1 ) objOpts.align = $(cell).css('text-align').replace('start','left').replace('end','right');
					if ( $.inArray($(cell).css('vertical-align'), ['top','middle','bottom']) > -1 ) objOpts.valign = $(cell).css('vertical-align');

					// C: Add padding [margin] (if any)
					// NOTE: Margins translate: px->pt 1:1 (e.g.: a 20px padded cell looks the same in PPTX as 20pt Text Inset/Padding)
					if ( $(cell).css('padding-left') ) {
						objOpts.marginPt = [];
						$.each(['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],function(i,val){
							objOpts.marginPt.push( Math.round($(cell).css(val).replace(/\D/gi,'') * ONEPT) );
						});
					}

					// D: Add colspan (if any)
					if ( $(cell).attr('colspan') ) objOpts.colspan = $(cell).attr('colspan');

					// E: Add border (if any)
					if ( $(cell).css('border-top-width') || $(cell).css('border-right-width') || $(cell).css('border-bottom-width') || $(cell).css('border-left-width') ) {
						objOpts.border = [];
						$.each(['top','right','bottom','left'], function(i,val){
							var intBorderW = Math.round( Number($(cell).css('border-'+val+'-width').replace('px','')) );
							var arrRGB = [];
							arrRGB = $(cell).css('border-'+val+'-color').replace(/\s+/gi,'').replace('rgba(','').replace('rgb(','').replace(')','').split(',');
							var strBorderC = rgbToHex( Number(arrRGB[0]), Number(arrRGB[1]), Number(arrRGB[2]) );
							objOpts.border.push( {pt:intBorderW, color:strBorderC} );
						});
					}

					// F: Massage cell text so we honor linebreak tag as a line break during line parsing
					var $cell = $(cell).clone();
					$cell.html( $(cell).html().replace(/<br[^>]*>/gi,'\n') );

					// LAST: Add cell
					arrObjTabCells.push({
						text: $cell.text(),
						opts: objOpts
					});
				});
				switch (val) {
					case 'thead': arrObjTabHeadRows.push( arrObjTabCells ); break;
					case 'tbody': arrObjTabBodyRows.push( arrObjTabCells ); break;
					case 'tfoot': arrObjTabFootRows.push( arrObjTabCells ); break;
					default:
				}
			});
		});

		// STEP 4: Paginate data: Iterate over all table rows, divide into slides/pages based upon the row height>overall height
		$.each([arrObjTabHeadRows,arrObjTabBodyRows,arrObjTabFootRows], function(iTab,tab){
			var currRow = [];
			$.each(tab, function(iRow,row){
				// A: Reset ROW variables
				var arrCellsLines = [], arrCellsLineHeights = [], emuRowH = 0, intMaxLineCnt = 0, intMaxColIdx = 0;

				// B: Parse and store each cell's text into line array (*MAGIC HAPPENS HERE*)
				$(row).each(function(iCell,cell){
					// 1: Create a cell object for each table column
					currRow.push({ text:'', opts:cell.opts });

					// 2: Parse cell contents into lines (**MAGIC HAPENSS HERE**)
					var lines = parseTextToLines(cell.text, cell.opts.font_size, (arrColW[iCell]/ONEPT));
					arrCellsLines.push( lines );

					// 3: Keep track of max line count within all row cells
					if ( lines.length > intMaxLineCnt ) { intMaxLineCnt = lines.length; intMaxColIdx = iCell; }
				});

				// C: Calculate Line-Height
				// FYI: Line-Height =~ font-size [px~=pt] * 1.65 / 100 = inches high
				// FYI: 1px = 14288 EMU (0.156 inches) @96 PPI - I ended up going with 20000 EMU as margin spacing needed a bit more than 1:1
				$(row).each(function(iCell,cell){
					var lineHeight = inch2Emu(cell.opts.font_size * 1.65 / 100);
					if ( Array.isArray(cell.opts.marginPt) && cell.opts.marginPt[0] ) lineHeight += cell.opts.marginPt[0] / intMaxLineCnt;
					if ( Array.isArray(cell.opts.marginPt) && cell.opts.marginPt[2] ) lineHeight += cell.opts.marginPt[2] / intMaxLineCnt;
					arrCellsLineHeights.push( Math.round(lineHeight) );
				});

				// D: AUTO-PAGING: Add text one-line-a-time to this row's cells until: lines are exhausted OR table H limit is hit
				for (var idx=0; idx<intMaxLineCnt; idx++) {
					// 1: Add the current line to cell
					for (var col=0; col<arrCellsLines.length; col++) {
						// A: Commit this slide to Presenation if table Height limit is hit
						if ( emuTabCurrH + arrCellsLineHeights[intMaxColIdx] > emuSlideTabH ) {
							// 1: Add the current row to table
							// NOTE: Edge cases can occur where we create a new slide only to have no more lines
							// ....: and then a blank row sits at the bottom of a table!
							// ....: Hence, we very all cells have text before adding this final row.
							$.each(currRow, function(i,cell){
								if (cell.text.length > 0 ) {
									// IMPORTANT: use jQuery extend (deep copy) or cell will mutate!!
									arrRows.push( $.extend(true, [], currRow) );
									return false; // break out of .each loop
								}
							});
							// 2: Add new Slide with current array of table rows
							arrObjSlides.push( $.extend(true, [], arrRows) );
							// 3: Empty rows for new Slide
							arrRows.length = 0;
							// 4: Reset curr table height for new Slide
							emuTabCurrH = 0; // This row's emuRowH w/b added below
							// 5: Empty current row's text (continue adding lines where we left off below)
							$.each(currRow,function(i,cell){ cell.text = ''; });
							// 6: Auto-Paging Options: addHeaderToEach
							if ( opts.addHeaderToEach ) {
								var headRow = [];
								$.each(arrObjTabHeadRows[0], function(iCell,cell){
									headRow.push({ text:cell.text, opts:cell.opts });
									var lines = parseTextToLines(cell.text, cell.opts.font_size, (arrColW[iCell]/ONEPT));
									if ( lines.length > intMaxLineCnt ) { intMaxLineCnt = lines.length; intMaxColIdx = iCell; }
								});
								arrRows.push( $.extend(true, [], headRow) );
							}
						}

						// B: Add next line of text to this cell
						if ( arrCellsLines[col][idx] ) currRow[col].text += arrCellsLines[col][idx];
					}

					// 2: Add this new rows H to overall (The cell with the longest line array is the one we use as the determiner for overall row Height)
					emuTabCurrH += arrCellsLineHeights[intMaxColIdx];
				}

				// E: Flush row buffer - Add the current row to table, then truncate row cell array
				// IMPORTANT: use jQuery extend (deep copy) or cell will mutate!!
				arrRows.push( $.extend(true, [], currRow) );
				currRow.length = 0;
			}); // row loop
		}); // tab loop
		// Flush final row buffer to slide
		arrObjSlides.push( $.extend(true,[],arrRows) );

		// STEP 5: Create a SLIDE for each of our 1-N table pieces
		$.each(arrObjSlides, function(i,slide){
			// A: Create table row array
			var arrTabRows = [];

			// B: Create new Slide
			var newSlide = (opts && opts.master && gObjPptxMasters) ?  api.addNewSlide(opts.master) : api.addNewSlide();

			// C: Create array of Rows
			$.each(slide, function(i,row){
				var arrTabRowCells = [];
				$.each(row, function(i,cell){ arrTabRowCells.push( cell ); });
				arrTabRows.push( arrTabRowCells );
			});

			// D: Add table to Slide
			newSlide.addTable( arrTabRows, {x:arrInchMargins[3], y:arrInchMargins[0], cx:(emuSlideTabW/EMU)}, {colW:arrColW} );

			// E: Add any additional objects
			if ( opts.addImage ) newSlide.addImage( opts.addImage.url,   opts.addImage.x, opts.addImage.y, opts.addImage.w, opts.addImage.h );
			if ( opts.addText  ) newSlide.addText(  opts.addText.text,   (opts.addText.opts  || {}) );
			if ( opts.addShape ) newSlide.addShape( opts.addShape.shape, (opts.addShape.opts || {}) );
			if ( opts.addTable ) newSlide.addTable( opts.addTable.rows,  (opts.addTable.opts || {}), (opts.addTable.tabOpts || {}) );
		});
	}
};
