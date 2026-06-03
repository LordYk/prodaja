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

    /* Ищет BattleMetrics ID для Rust сервера.
       Алгоритм (от быстрого к медленному):
       1. Прямой поиск по IP:port через BM API filter[ids][IP]
          Перебираем все вероятные порты (appPort и его производные)
       2. Поиск по названию сервера с проверкой IP
          Несколько вариантов запроса: полное → 3 слова → 2 слова
    */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const base = 'https://api.battlemetrics.com/servers';
        const log = (msg) => { if (client?.log) client.log('INFO', `[BM] ${msg}`); };

        /* ── Шаг 1: перебор портов ─────────────────────────────────────── */
        /* Rust appPort → gamePort: стандарт +8 (28015→28023), но серверы типа
           Rusty Moose используют нестандартные (28082 appPort, 28015 gamePort).
           Пробуем все разумные варианты. */
        const ports = [...new Set([
            port,
            port - 1, port - 2, port - 3,
            port + 1, port + 2, port + 5,
            port - 67, port - 68,   /* Rusty Moose: 28082-67=28015 */
            28015, 28016, 28017,    /* стандартные Rust порты */
        ])].filter(p => p > 0 && p < 65536);

        for (const p of ports) {
            try {
                const res = await Axios.get(
                    `${base}?filter[game]=rust&filter[ids][IP]=${ip}:${p}&fields[server]=id,name,ip,port`,
                    { timeout: 6000 });
                if (res.data?.data?.length > 0) {
                    log(`Found by IP:port ${ip}:${p} → id=${res.data.data[0].id}`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* продолжаем */ }
        }

        /* ── Шаг 2: поиск по названию ──────────────────────────────────── */
        if (serverName) {
            const clean = serverName.replace(/[|#\[\](){}]/g, ' ').replace(/\s+/g, ' ').trim();
            const words = clean.split(' ').filter(w => w);
            const queries = [...new Set([
                clean,
                words.slice(0, 3).join(' '),
                words.slice(0, 2).join(' '),
            ])].filter(q => q.length >= 2);

            for (const q of queries) {
                try {
                    const res = await Axios.get(
                        `${base}?filter[game]=rust&filter[search]=${encodeURIComponent(q)}` +
                        `&fields[server]=id,name,ip,port&page[size]=100`,
                        { timeout: 6000 });

                    if (!res.data?.data?.length) continue;
                    const servers = res.data.data;

                    /* IP + точное имя */
                    const exact = servers.find(s => s.attributes.ip === ip && s.attributes.name === serverName);
                    if (exact) { log(`Found by name+IP exact: ${exact.id}`); return exact.id; }

                    /* Только IP */
                    const byIp = servers.find(s => s.attributes.ip === ip);
                    if (byIp) { log(`Found by IP in name results: ${byIp.id}`); return byIp.id; }

                    /* Точное имя без IP проверки */
                    const byName = servers.find(s => s.attributes.name === serverName);
                    if (byName) { log(`Found by exact name: ${byName.id}`); return byName.id; }
                }
                catch (e) { /* продолжаем */ }
            }
        }

        log(`Not found: ip=${ip} port=${port} name="${serverName}"`);
        return null;
    },
};
