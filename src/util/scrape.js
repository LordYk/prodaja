/*
Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)
...
*/

const Axios = require('axios');
const Constants = require('../util/constants.js');
const Utils = require('../util/utils.js');

module.exports = {

    scrape: async function (url) {
        try {
            return await Axios.get(url);
        }
        catch (e) {
            return {};
        }
    },

    scrapeSteamProfilePicture: async function (client, steamId) {
        const response = await module.exports.scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);
        if (response.status !== 200) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfilePicture', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        let png = response.data.match(/<img src="(.*_full.jpg)(.*?(?="))/);
        if (png) return png[1];
        return null;
    },

    scrapeSteamProfileName: async function (client, steamId) {
        const response = await module.exports.scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);
        if (response.status !== 200) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfileName', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        let regex = new RegExp(`class="actual_persona_name">(.+?)</span>`, 'gm');
        let data = regex.exec(response.data);
        if (data) return Utils.decodeHtml(data[1]);
        return null;
    },

    /* Автоматически ищет BattleMetrics ID для Rust сервера.
       Пробует несколько способов:
       1) IP + разные порты (game, +1, +5, 28017, 28015)
       2) По полному названию сервера с проверкой IP
       3) По сокращённому названию (первые 2-3 слова) с проверкой IP
       4) Только по IP (без порта)
    */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const baseUrl = 'https://api.battlemetrics.com/servers';

        const log = (msg) => {
            if (client && client.log) client.log('INFO', `[Scrape/BM] ${msg}`);
        };

        /* ── 1. Перебираем порты ─────────────────────────────────────────── */
        const portsToTry = [...new Set([port, port + 1, port + 5, 28015, 28017])];

        for (const tryPort of portsToTry) {
            try {
                const res = await Axios.get(
                    `${baseUrl}?filter[game]=rust&filter[ids][IP]=${ip}:${tryPort}&fields[server]=id,name,ip,port`,
                    { timeout: 8000 }
                );
                if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                    log(`Found id=${res.data.data[0].id} via ${ip}:${tryPort}`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* продолжаем */ }
        }

        /* ── 2–3. Поиск по названию ─────────────────────────────────────── */
        if (serverName) {
            /* Несколько вариантов запроса: полное имя и укороченные */
            const namesToSearch = [serverName];

            /* Убираем теги клана в начале/конце вида [TAG] или |TAG| */
            const stripped = serverName.replace(/^[\[|({][^\]|)}\s]+[\]|)}\s]\s*/i, '').trim();
            if (stripped && stripped !== serverName) namesToSearch.push(stripped);

            /* Первые 3 слова */
            const words = serverName.split(' ');
            if (words.length > 3) namesToSearch.push(words.slice(0, 3).join(' '));

            /* Первые 2 слова */
            if (words.length > 2) namesToSearch.push(words.slice(0, 2).join(' '));

            for (const name of namesToSearch) {
                try {
                    const encoded = encodeURIComponent(name);
                    const res = await Axios.get(
                        `${baseUrl}?filter[game]=rust&filter[search]=${encoded}` +
                        `&fields[server]=id,name,ip,port&page[size]=20`,
                        { timeout: 8000 }
                    );

                    if (res.status !== 200 || !res.data.data || res.data.data.length === 0) continue;

                    /* Точное совпадение по IP */
                    const byIp = res.data.data.find(s => s.attributes && s.attributes.ip === ip);
                    if (byIp) {
                        log(`Found id=${byIp.id} via name="${name}" + IP match`);
                        return byIp.id;
                    }

                    /* Точное совпадение по имени */
                    const byName = res.data.data.find(s =>
                        s.attributes && s.attributes.name === serverName
                    );
                    if (byName) {
                        log(`Found id=${byName.id} via exact name match`);
                        return byName.id;
                    }
                }
                catch (e) { /* продолжаем */ }
            }

            /* ── 4. Последний шанс: поиск только по IP без порта ─────────── */
            try {
                const res = await Axios.get(
                    `${baseUrl}?filter[game]=rust&filter[ids][IP]=${ip}&fields[server]=id,name,ip,port&page[size]=10`,
                    { timeout: 8000 }
                );
                if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                    /* Если один результат — берём его */
                    if (res.data.data.length === 1) {
                        log(`Found id=${res.data.data[0].id} via IP-only search`);
                        return res.data.data[0].id;
                    }
                    /* Если несколько — ищем по похожему имени */
                    const best = res.data.data.find(s =>
                        s.attributes && serverName &&
                        s.attributes.name.toLowerCase().includes(serverName.split(' ')[0].toLowerCase())
                    );
                    if (best) {
                        log(`Found id=${best.id} via IP-only + partial name`);
                        return best.id;
                    }
                    log(`Found id=${res.data.data[0].id} via IP-only (first result)`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* не нашли */ }
        }

        log(`Could not find BM server for ip=${ip} port=${port} name="${serverName}"`);
        return null;
    },
};
