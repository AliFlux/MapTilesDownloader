// Map Tile Stitcher for Photoshop
// Usage: File > Scripts > Browse > select this file
// Then select the timestamped download folder (the one containing z/x/y structure)

#target photoshop

app.bringToFront();

function main() {

    // --- Select folder ---
    var tilesFolder = Folder.selectDialog("Select the tiles download folder (the timestamped folder containing z/x/y subfolders)");
    if (!tilesFolder) return;

    // --- Find zoom level folders ---
    var zoomFolders = tilesFolder.getFiles(function(f) {
        return f instanceof Folder && !isNaN(parseInt(f.name));
    }).sort(function(a, b) { return parseInt(a.name) - parseInt(b.name); });

    if (zoomFolders.length === 0) {
        alert("No zoom level folders found. Make sure you selected the correct folder.");
        return;
    }

    // --- Pick zoom level ---
    var zoomFolder;
    if (zoomFolders.length === 1) {
        zoomFolder = zoomFolders[0];
    } else {
        var names = [];
        for (var i = 0; i < zoomFolders.length; i++) names.push(zoomFolders[i].name);
        var choice = prompt(
            "Multiple zoom levels found: " + names.join(", ") + "\n\nEnter the zoom level to stitch (highest = most detail):",
            names[names.length - 1]
        );
        if (!choice) return;
        zoomFolder = new Folder(tilesFolder.fsName + "/" + parseInt(choice));
        if (!zoomFolder.exists) { alert("Zoom level " + choice + " not found."); return; }
    }

    // --- Collect all tile files ---
    var tiles = [];
    var minX = Infinity, maxX = -Infinity;
    var minY = Infinity, maxY = -Infinity;

    var xFolders = zoomFolder.getFiles(function(f) {
        return f instanceof Folder && !isNaN(parseInt(f.name));
    });

    for (var i = 0; i < xFolders.length; i++) {
        var x = parseInt(xFolders[i].name);
        var files = xFolders[i].getFiles(function(f) {
            return f instanceof File && /\.(png|jpg|jpeg)$/i.test(f.name);
        });
        for (var j = 0; j < files.length; j++) {
            var y = parseInt(files[j].name.replace(/\.[^.]+$/, ""));
            if (isNaN(y)) continue;
            tiles.push({ x: x, y: y, file: files[j] });
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    if (tiles.length === 0) {
        alert("No tile images found inside zoom level " + zoomFolder.name + ".");
        return;
    }

    // --- Get tile dimensions from first tile ---
    var sampleDoc = app.open(tiles[0].file);
    var tileW = sampleDoc.width.value;
    var tileH = sampleDoc.height.value;
    var tileRes = sampleDoc.resolution;
    sampleDoc.close(SaveOptions.DONOTSAVECHANGES);

    var cols = maxX - minX + 1;
    var rows = maxY - minY + 1;
    var totalW = cols * tileW;
    var totalH = rows * tileH;
    var megapixels = Math.round((totalW * totalH) / 1000000);

    // --- Warn for large outputs ---
    if (tiles.length > 500 || megapixels > 500) {
        var proceed = confirm(
            "Stitching " + tiles.length + " tiles into a " +
            totalW + " x " + totalH + " px image (" + megapixels + " MP).\n\n" +
            "This may take several minutes and use significant memory.\n\nContinue?"
        );
        if (!proceed) return;
    }

    // --- Create canvas ---
    var newDoc = app.documents.add(
        new UnitValue(totalW, "px"),
        new UnitValue(totalH, "px"),
        tileRes,
        "stitched_z" + zoomFolder.name,
        NewDocumentMode.RGB,
        DocumentFill.TRANSPARENT
    );

    // Set ruler units to pixels for reliable positioning
    var prevUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    // --- Place each tile ---
    for (var k = 0; k < tiles.length; k++) {
        var tile = tiles[k];
        var destX = (tile.x - minX) * tileW;
        var destY = (tile.y - minY) * tileH;

        var tileDoc = app.open(tile.file);
        tileDoc.selection.selectAll();
        tileDoc.selection.copy();
        tileDoc.close(SaveOptions.DONOTSAVECHANGES);

        app.activeDocument = newDoc;
        var layer = newDoc.paste();
        layer.name = tile.x + "_" + tile.y;

        // Bounds after paste: layer is centred on canvas
        var curLeft  = layer.bounds[0].value;
        var curTop   = layer.bounds[1].value;
        layer.translate(destX - curLeft, destY - curTop);

        // Progress in title bar
        app.activeDocument.info.caption = "Stitching tile " + (k + 1) + " of " + tiles.length;
    }

    // --- Flatten & save ---
    newDoc.flatten();
    app.preferences.rulerUnits = prevUnits;

    // Save as TIFF next to the tile folders
    var outputFile = new File(tilesFolder.fsName + "/stitched_z" + zoomFolder.name + ".tif");
    var tiffOpts = new TiffSaveOptions();
    tiffOpts.imageCompression = TIFFEncoding.TIFFLZW;
    tiffOpts.layers = false;
    newDoc.saveAs(outputFile, tiffOpts, true);

    alert("Done!\n\nSaved to:\n" + outputFile.fsName);
}

main();
