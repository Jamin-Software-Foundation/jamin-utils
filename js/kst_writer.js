async function buildKstFile(drumName, chordName, chordVariations, bassName, bassVariations, kstTempo) {	
    let bassVarTable = ['ARRA', 'ARRB', 'ARRC', 'ARRD'];
    let chordVarTable = ['ARRA', 'ARRB', 'ARRC', 'ARRD'];
	
	if (bassVariations == 3) bassVarTable = ['ARRA', 'ARRB', 'ARRC', 'ARRB'];
	if (bassVariations == 2) bassVarTable = ['ARRA', 'ARRB', 'ARRA', 'ARRB'];
	if (bassVariations == 1) bassVarTable = ['ARRA', 'ARRA', 'ARRA', 'ARRA'];
		
	if (chordVariations == 3) chordVarTable = ['ARRA', 'ARRB', 'ARRC', 'ARRB'];
	if (chordVariations == 2) chordVarTable = ['ARRA', 'ARRB', 'ARRA', 'ARRB'];
	if (chordVariations == 1) chordVarTable = ['ARRA', 'ARRA', 'ARRA', 'ARRA'];
	
	const response = await fetch('assets/ketron-event.kst');
	const kshpChunk = await response.bytes();
	console.debug("Fetched raw file bytes directly:", kshpChunk.length);
	
	// Tempo
	
	const microsecondsPerBeat = Math.ceil(60000000 / kstTempo);
	kshpChunk[0x22] = (microsecondsPerBeat >> 16) & 0xFF;
	kshpChunk[0x23] = (microsecondsPerBeat >> 8) & 0xFF;
	kshpChunk[0x24] =  microsecondsPerBeat & 0xFF;	
	
	// Audio loop names
	
	replaceNullTerminatedString(kshpChunk, 0x4D2C, drumName + "_" + kstTempo);

	replaceNullTerminatedString(kshpChunk, 0x56F5, bassName + " " + bassVarTable[0] + "_" + kstTempo);
	replaceNullTerminatedString(kshpChunk, 0x5745, bassName + " " + bassVarTable[1] + "_" + kstTempo);
	replaceNullTerminatedString(kshpChunk, 0x5795, bassName + " " + bassVarTable[2] + "_" + kstTempo);
	replaceNullTerminatedString(kshpChunk, 0x57E5, bassName + " " + bassVarTable[3] + "_" + kstTempo);
	
	replaceNullTerminatedString(kshpChunk, 0x58D5, chordName + " " + chordVarTable[0] + "_" + kstTempo);	
	replaceNullTerminatedString(kshpChunk, 0x5925, chordName + " " + chordVarTable[1] + "_" + kstTempo);	
	replaceNullTerminatedString(kshpChunk, 0x5975, chordName + " " + chordVarTable[2] + "_" + kstTempo);	
	replaceNullTerminatedString(kshpChunk, 0x59C5, chordName + " " + chordVarTable[3] + "_" + kstTempo);	
	return kshpChunk;
}

function replaceNullTerminatedString(targetArray, startIndex, newString) {
	/**
	 * Replaces a null-terminated string inside a Uint8Array at a specific index.
	 * 
	 * @param {Uint8Array} targetArray - The main binary array (e.g., your KSHP data).
	 * @param {number} startIndex - The exact byte index where the string begins.
	 * @param {string} newString - The new text string to inject.
	 */	
    // Convert the string into standard raw UTF-8 bytes
    const encoder = new TextEncoder();
    const stringBytes = encoder.encode(newString);
    
    // Inject the string bytes directly into the array at the target address
    targetArray.set(stringBytes, startIndex);
    
    // Append the mandatory null terminator (0x00) immediately after the text
    targetArray[startIndex + stringBytes.length] = 0;
}
