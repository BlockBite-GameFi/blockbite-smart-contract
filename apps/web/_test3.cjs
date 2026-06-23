const https = require('https');
https.get('https://blockbite-iksctyqbv-nayrbryangamings-projects.vercel.app', (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
        const jsFiles = [...data.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(m => m[1]);
        if (jsFiles.length === 0) { console.log('no chunks'); process.exit(0); }
        let checked = 0;
        jsFiles.forEach(file => {
            https.get('https://blockbite-iksctyqbv-nayrbryangamings-projects.vercel.app' + file, (r) => {
                let sData = '';
                r.on('data', (c) => sData += c);
                r.on('end', () => {
                    checked++;
                    if(sData.includes('alloc(81)') || sData.includes('alloc(48)')) {
                        console.log(file, 'alloc81=' + sData.includes('alloc(81)'), 'alloc48=' + sData.includes('alloc(48)'));
                    }
                    if(checked === jsFiles.length) console.log('done');
                });
            });
        });
    });
});
