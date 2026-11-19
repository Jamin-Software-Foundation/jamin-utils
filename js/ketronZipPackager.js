const { JSZip } = window;

/**
 * Packages rendered WAV blobs into a Ketron-formatted ZIP archive (StyleName_BPM/)
 * and triggers an immediate browser download.
 *
 * @param {string} styleName - Clean base name for the style
 * @param {number} bpm - Base tempo encoded into the Ketron folder name
 * @param {Array<Object>} renderedWavs - Array of { fileName, slot, role, blob }
 */
export async function downloadKetronStyleZip(styleName, bpm, renderedWavs) {
  const zip = new JSZip();

  // Sanitise folder name and append _BPM as required by Ketron Event audio styles
  const safeName = (styleName || 'CustomStyle')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 24);

  const folderName = `${safeName}_${bpm}`;
  const styleFolder = zip.folder(folderName);

  // Add each rendered 44.1 kHz 16-bit WAV loop into the style folder
  for (const item of renderedWavs) {
    styleFolder.file(item.fileName, item.blob);
  }

  // Include a lightweight JSON map for reference or downstream style-building tools
  const manifest = {
    styleName: safeName,
    bpm,
    sampleRate: 44100,
    bitDepth: 16,
    loops: renderedWavs.map(w => ({
      fileName: w.fileName,
      slot: w.slot,
      role: w.role
    }))
  };
  styleFolder.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate ZIP blob and trigger browser download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(zipBlob);

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${folderName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL after download starts
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}
