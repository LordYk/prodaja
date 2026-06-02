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
       1) IP + game port
       2) IP + query port (game port + 1)
       3) IP + query port (game port + 5)
       4) IP + стандартный query port 28017
       5) По названию сервера с проверкой IP
    */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const baseUrl = 'https://api.battlemetrics.com/servers';

        const portsToTry = [
            port,
            port + 1,
            port + 5,
            28017,
        ];

        /* Убираем дубликаты */
        const uniquePorts = [...new Set(portsToTry)];

        for (const tryPort of uniquePorts) {
            try {
                const res = await Axios.get(
                    `${baseUrl}?filter[game]=rust&filter[ids][IP]=${ip}:${tryPort}&fields[server]=id,name,ip,port`
                );
                if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                    client.log && client.log('INFO',
                        `[Scrape] Found BM ID=${res.data.data[0].id} via IP ${ip}:${tryPort}`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* продолжаем */ }
        }

        /* Поиск по названию сервера */
        if (serverName) {
            try {
                const encoded = encodeURIComponent(serverName);
                const res = await Axios.get(
                    `${baseUrl}?filter[game]=rust&filter[search]=${encoded}&fields[server]=id,name,ip,port&page[size]=10`
                );
                if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                    /* Сначала ищем точное совпадение по IP */
                    const exact = res.data.data.find(s => s.attributes && s.attributes.ip === ip);
                    if (exact) {
                        client.log && client.log('INFO',
                            `[Scrape] Found BM ID=${exact.id} via name search + IP match`);
                        return exact.id;
                    }
                    /* Частичное совпадение по IP (если несколько серверов на хосте) */
                    const partial = res.data.data.find(s => s.attributes && s.attributes.ip === ip);
                    if (partial) return partial.id;
                    /* Если IP не совпадает — берём первый результат (менее надёжно) */
                    client.log && client.log('INFO',
                        `[Scrape] Found BM ID=${res.data.data[0].id} via name search (no IP match)`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* не нашли */ }
        }

        return null;
    },
};
