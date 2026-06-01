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
       Пробует 3 способа по очереди:
       1) IP + game port
       2) IP + query port (game port + 5)
       3) По названию сервера с проверкой IP
    */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const baseUrl = 'https://api.battlemetrics.com/servers';

        /* 1. Поиск по IP + game port */
        try {
            const res = await Axios.get(
                `${baseUrl}?filter[game]=rust&filter[ids][IP]=${ip}:${port}&fields[server]=id,name,ip,port`
            );
            if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                return res.data.data[0].id;
            }
        }
        catch (e) { /* продолжаем */ }

        /* 2. Поиск по IP + query port (обычно game port + 5) */
        try {
            const queryPort = port + 5;
            const res = await Axios.get(
                `${baseUrl}?filter[game]=rust&filter[ids][IP]=${ip}:${queryPort}&fields[server]=id,name,ip,port`
            );
            if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                return res.data.data[0].id;
            }
        }
        catch (e) { /* продолжаем */ }

        /* 3. Поиск по названию сервера */
        if (serverName) {
            try {
                const encoded = encodeURIComponent(serverName);
                const res = await Axios.get(
                    `${baseUrl}?filter[game]=rust&filter[search]=${encoded}&fields[server]=id,name,ip,port&page[size]=5`
                );
                if (res.status === 200 && res.data.data && res.data.data.length > 0) {
                    /* Сначала ищем точное совпадение по IP */
                    const exact = res.data.data.find(s => s.attributes.ip === ip);
                    if (exact) return exact.id;
                    /* Иначе первый результат */
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* не нашли */ }
        }

        return null;
    },
};
