/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    https://github.com/alexemanuelol/rustplusplus

*/

const DiscordTools = require('../discordTools/discordTools.js');
const PermissionHandler = require('../handlers/permissionHandler.js');

module.exports = async (client, guild) => {
    const instance = client.getInstance(guild.id);
    const categoryName = 'Rinfo';

    let category = undefined;

    /* Сначала ищем по сохранённому ID */
    if (instance.channelId.category !== null) {
        category = DiscordTools.getCategoryById(guild.id, instance.channelId.category);
    }

    /* Если не нашли по ID — ищем по названию (после редеплоя на Railway) */
    if (category === undefined) {
        category = DiscordTools.getCategoryByName(guild.id, categoryName);
        if (category !== undefined) {
            /* Нашли существующую — сохраняем её ID */
            instance.channelId.category = category.id;
            client.setInstance(guild.id, instance);
        }
    }

    /* Если вообще нет — создаём новую */
    if (category === undefined) {
        category = await DiscordTools.addCategory(guild.id, categoryName);
        instance.channelId.category = category.id;
        client.setInstance(guild.id, instance);
    }

    const perms = PermissionHandler.getPermissionsReset(client, guild, false);

    try {
        await category.permissionOverwrites.set(perms);
    }
    catch (e) {
        /* Ignore */
    }

    return category;
};
