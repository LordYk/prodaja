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

const Discord = require('discord.js');
const Path = require('path');

const Constants = require('../util/constants.js');
const DiscordButtons = require('./discordButtons.js');
const DiscordEmbeds = require('./discordEmbeds.js');
const DiscordSelectMenus = require('./discordSelectMenus.js');
const DiscordTools = require('./discordTools.js');
const InstanceUtils = require('../util/instanceUtils.js');
const RestoreSettingsFromDiscord = require('./RestoreSettingsFromDiscord.js');

module.exports = async (client, guild, forced = false) => {
    const instance = client.getInstance(guild.id);
    const channel = DiscordTools.getTextChannelById(guild.id, instance.channelId.settings);

    if (!channel) {
        client.log(client.intlGet(null, 'errorCap'), 'SetupSettingsMenu: ' +
            client.intlGet(null, 'invalidGuildOrChannel'), 'error');
        return;
    }

    /* Проверяем есть ли уже сообщения в канале настроек */
    let channelMessages = [];
    try {
        const fetched = await channel.messages.fetch({ limit: 5 });
        channelMessages = [...fetched.values()];
    }
    catch (e) { /* Ignore */ }

    const channelIsEmpty = channelMessages.length === 0;

    if (!channelIsEmpty && !forced) {
        /* Канал не пустой — восстанавливаем настройки из Discord-сообщений,
           чтобы не потерять изменения пользователя после редеплоя на Railway */
        await RestoreSettingsFromDiscord(client, guild);

        if (instance.firstTime) {
            instance.firstTime = false;
            client.setInstance(guild.id, instance);
        }
        return;
    }

    /* Канал пустой или forced=true — создаём меню настроек заново */
    await DiscordTools.clearTextChannel(guild.id, instance.channelId.settings, 100);

    await setupAccountMessage(client, guild.id, channel);
    await setupGeneralSettings(client, guild.id, channel);
    await setupNotificationSettings(client, guild.id, channel);

    instance.firstTime = false;
    client.setInstance(guild.id, instance);
};

/**
 * Строит embed для сообщения аккаунта.
 * Credentials хранятся в footer (base64 JSON) для восстановления при редеплое.
 */
function buildAccountEmbed(client, guildId) {
    const credentials = InstanceUtils.readCredentialsFile(guildId);
    const hoster = credentials.hoster;

    let description = '';
    for (const steamId in credentials) {
        if (steamId === 'hoster') continue;
        const cred = credentials[steamId];
        const isHoster = steamId === hoster;
        const steamLink = `[${steamId}](https://steamcommunity.com/profiles/${steamId})`;
        const discordMention = cred.discord_user_id ? `<@${cred.discord_user_id}>` : '?';
        description += `${isHoster ? '👑 ' : ''}**${discordMention}** — ${steamLink}\n`;
        description += `> issued: \`${cred.issued_date || '?'}\`  expire: \`${cred.expire_date || '?'}\`\n\n`;
    }
    if (!description) description = '*Credentials не добавлены. Используй `/credentials add`*';

    const b64 = Buffer.from(JSON.stringify(credentials)).toString('base64');

    return DiscordEmbeds.getEmbed({
        color: 0x5865F2,
        title: '👤 Аккаунт',
        description: description,
        footer: { text: b64 }
    });
}

async function setupAccountMessage(client, guildId, channel) {
    await client.messageSend(channel, { embeds: [buildAccountEmbed(client, guildId)] });
}

/**
 * Обновляет уже существующее сообщение аккаунта в канале настроек.
 * Вызывается после /credentials add / remove / set_hoster.
 */
module.exports.updateAccountMessage = async (client, guildId) => {
    const instance = client.getInstance(guildId);
    const channel = DiscordTools.getTextChannelById(guildId, instance.channelId.settings);
    if (!channel) return;
    try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        const messages = [...fetched.values()].reverse();
        for (const msg of messages) {
            if (msg.author.id === client.user.id &&
                msg.embeds.length > 0 &&
                msg.embeds[0].title === '👤 Аккаунт') {
                await msg.edit({ embeds: [buildAccountEmbed(client, guildId)] });
                return;
            }
        }
    } catch (e) { /* ignore */ }
};

async function setupGeneralSettings(client, guildId, channel) {
    const instance = client.getInstance(guildId);

    await client.messageSend(channel, {
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..',
                `resources/images/settings/general_settings_logo_${instance.generalSettings.language}.png`))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'selectLanguageSetting'),
            thumbnail: `attachment://settings_logo.png`,
            fields: [
                {
                    name: client.intlGet(guildId, 'noteCap'),
                    value: client.intlGet(guildId, 'selectLanguageExtendSetting'),
                    inline: true
                }]
        })],
        components: [DiscordSelectMenus.getLanguageSelectMenu(guildId, instance.generalSettings.language)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'commandsVoiceGenderDesc'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordSelectMenus.getVoiceGenderSelectMenu(guildId, instance.generalSettings.voiceGender)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'selectInGamePrefixSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordSelectMenus.getPrefixSelectMenu(guildId, instance.generalSettings.prefix)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'selectTrademarkSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordSelectMenus.getTrademarkSelectMenu(guildId, instance.generalSettings.trademark)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldCommandsEnabledSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getInGameCommandsEnabledButton(guildId,
            instance.generalSettings.inGameCommandsEnabled)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldBotBeMutedSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getBotMutedInGameButton(guildId, instance.generalSettings.muteInGameBotMessages)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'inGameTeamNotificationsSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getInGameTeammateNotificationsButtons(guildId)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'commandDelaySetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordSelectMenus.getCommandDelaySelectMenu(guildId, instance.generalSettings.commandDelay)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldSmartAlarmNotifyNotConnectedSetting'),
            thumbnail: `attachment://settings_logo.png`,
            fields: [
                {
                    name: client.intlGet(guildId, 'noteCap'),
                    value: client.intlGet(guildId, 'smartAlarmNotifyExtendSetting'),
                    inline: true
                }]
        })],
        components: [
            DiscordButtons.getFcmAlarmNotificationButtons(
                guildId,
                instance.generalSettings.fcmAlarmNotificationEnabled,
                instance.generalSettings.fcmAlarmNotificationEveryone)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldSmartAlarmsNotifyInGameSetting'),
            thumbnail: `attachment://settings_logo.png`,
        })],
        components: [DiscordButtons.getSmartAlarmNotifyInGameButton(guildId,
            instance.generalSettings.smartAlarmNotifyInGame)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldSmartSwitchNotifyInGameWhenChangedFromDiscord'),
            thumbnail: `attachment://settings_logo.png`,
        })],
        components: [DiscordButtons.getSmartSwitchNotifyInGameWhenChangedFromDiscordButton(guildId,
            instance.generalSettings.smartSwitchNotifyInGameWhenChangedFromDiscord)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldLeaderCommandEnabledSetting'),
            thumbnail: `attachment://settings_logo.png`,
        })],
        components: [DiscordButtons.getLeaderCommandEnabledButton(guildId,
            instance.generalSettings.leaderCommandEnabled)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'shouldLeaderCommandOnlyForPairedSetting'),
            thumbnail: `attachment://settings_logo.png`,
        })],
        components: [DiscordButtons.getLeaderCommandOnlyForPairedButton(guildId,
            instance.generalSettings.leaderCommandOnlyForPaired)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'mapWipeDetectedNotifySetting', { group: '@everyone' }),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getMapWipeNotifyEveryoneButton(instance.generalSettings.mapWipeNotifyEveryone)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'itemAvailableNotifyInGameSetting'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getItemAvailableNotifyInGameButton(guildId,
            instance.generalSettings.itemAvailableInVendingMachineNotifyInGame)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'displayInformationBattlemetricsAllOnlinePlayers'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: [DiscordButtons.getDisplayInformationBattlemetricsAllOnlinePlayersButton(guildId,
            instance.generalSettings.displayInformationBattlemetricsAllOnlinePlayers)],
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });

    await client.messageSend(channel, {
        embeds: [DiscordEmbeds.getEmbed({
            color: Constants.COLOR_SETTINGS,
            title: client.intlGet(guildId, 'subscribeToChangesBattlemetrics'),
            thumbnail: `attachment://settings_logo.png`
        })],
        components: DiscordButtons.getSubscribeToChangesBattlemetricsButtons(guildId),
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..', 'resources/images/settings_logo.png'))]
    });
}

async function setupNotificationSettings(client, guildId, channel) {
    const instance = client.getInstance(guildId);

    await client.messageSend(channel, {
        files: [new Discord.AttachmentBuilder(
            Path.join(__dirname, '..',
                `resources/images/settings/notification_settings_logo_${instance.generalSettings.language}.png`))]
    });

    for (const setting in instance.notificationSettings) {
        await client.messageSend(channel, {
            embeds: [DiscordEmbeds.getEmbed({
                color: Constants.COLOR_SETTINGS,
                title: client.intlGet(guildId, setting),
                thumbnail: `attachment://${instance.notificationSettings[setting].image}`
            })],
            components: [
                DiscordButtons.getNotificationButtons(
                    guildId, setting,
                    instance.notificationSettings[setting].discord,
                    instance.notificationSettings[setting].inGame,
                    instance.notificationSettings[setting].voice)],
            files: [
                new Discord.AttachmentBuilder(
                    Path.join(__dirname, '..',
                        `resources/images/events/${instance.notificationSettings[setting].image}`))]
        });
    }
}
