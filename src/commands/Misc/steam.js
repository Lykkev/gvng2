const Command = require("../../lib/structures/Command");
const format = require("../../lib/scripts/Format");
const fetch = require("node-fetch");

class steamCommand extends Command {
  constructor(...args) {
    super(...args, {
      aliases: ["steamaccount", "steaminfo", "steamuser"],
      args: "<username:string>",
      description: "Displays info about a Steam account.",
      requiredkeys: ["steam"],
      cooldown: 5,
    });
  }

  async run(msg, args) {
    // Sets static Steam things
    let steamid;
    let id;
    let profile;
    let bans;
    let games;
    let steamlvl;
    let description;
    // Vanity URL
    if (/^\d+$/.test(args[0])) steamid = args[0];
    else if (args.join(" ").startsWith("https://steamcommunity.com/id/")) args[0] = args.join(" ").substring(`https://steamcommunity.com/id/`.length, args.join(" ").length);
    if (!steamid) {
      // Fetches the API
      id = await fetch(`http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${this.bot.key.steam}&vanityurl=${encodeURIComponent(args[0])}`)
        .then(async res => await res.json().catch(() => {}));
      if (!id || id.response.success !== 1) {
        return msg.channel.createMessage(this.bot.embed("❌ Error", "Account not found.", "error"));
      }
      steamid = id.response.steamid;
    }

    // Gets summary info
    const steamsg = await msg.channel.createMessage(this.bot.embed("🎮 Steam", "Waiting for a response from Steam...", "general"));
    profile = await fetch(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.bot.key.steam}&steamids=${steamid}`)
      .then(async res => await res.json().catch(() => {}));
    profile = profile.response.players[0];
    // Gets ban info
    bans = await fetch(`http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${this.bot.key.steam}&steamids=${steamid}`)
      .then(async res => await res.json().catch(() => {}));
    bans = bans.players[0];
    // Gets their owned games
    games = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?steamid=${steamid}
      &include_appinfo=1&include_played_free_games=1&key=${this.bot.key.steam}`)
      .then(async res => await res.json().catch(() => {}));
    games = games.response;
    // Gets their steam level
    steamlvl = await fetch(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?steamid=${steamid}&key=${this.bot.key.steam}`)
      .then(async res => await res.json().catch(() => {}));
    steamlvl = steamlvl.response.player_level;
    // Gets the profile's description in a hacky way
    description = await fetch(`http://steamcommunity.com/profiles/${steamid}`)
      .then(async res => await res.text().catch(() => {}));
    description = /<div class="profile_summary">[\s\n]{0,}([\w\d\s;_\-,.]{0,512})<\/div>/.exec(description);
    if (description) description = description[1];
    if (!description || description === "No information given.") description = null;
    if (description && description.length > 256) description = `${description.substring(0, 256)}...`;

    // Handler for if the API returns garbage/invalid stuff
    if (!profile || !bans || !games) {
      return msg.channel.createMessage(this.bot.embed("❌ Error", "Account not found.", "error"));
    }

    // Makes the user statuses look better
    if (profile.personastate === 0) profile.personastate = "Offline/Invisible";
    if (profile.personastate === 1) profile.personastate = "Online";
    if (profile.personastate === 2) profile.personastate = "Busy";
    if (profile.personastate === 3) profile.personastate = "Away";
    if (profile.personastate === 4) profile.personastate = "Snooze";
    if (profile.personastate === 5) profile.personastate = "Looking to trade";
    if (profile.personastate === 6) profile.personastate = "Looking to play";

    // Fields construct
    const fieldsConstruct = [{
      name: "ID",
      value: profile.steamid,
      inline: true,
    }, {
      name: "Display Name",
      value: profile.personaname,
      inline: true,
    }, {
      name: "Visibility",
      value: profile.personastate || "Private",
      inline: true,
    }, {
      name: "Playing",
      value: `${profile.gameid ? games.games.find(game => game.appid === profile.gameid).name : "None/Private"}`,
      inline: true,
    }, {
      name: "Games Owned",
      value: games.game_count || "Private",
      inline: true,
    }, {
      name: "Level",
      value: steamlvl || "0",
      inline: true,
    }, {
      name: "Creation Date",
      value: profile.timecreated ? format.date(profile.timecreated * 1000) : "Unknown",
      inline: true,
    }, {
      name: "Last Offline",
      value: profile.lastlogoff !== undefined ? `${format.dateParse(new Date() / 1000 - profile.lastlogoff)} ago` : "Unknown",
      inline: true,
    }];

    // Country
    if (profile.loccountrycode) {
      fieldsConstruct.push({
        name: "Country",
        value: `:flag_${profile.loccountrycode.toLowerCase()}:` || "Unknown",
        inline: true,
      });
    }

    // Real name
    if (profile.realname) {
      fieldsConstruct.push({
        name: "Real Name",
        value: profile.realname,
        inline: true,
      });
    }

    // Construct for ban fields
    let banstring = "";
    if (bans.NumberOfVACBans > 0 || bans.NumberOfGameBans > 0 || bans.EconomyBan !== "none") {
      if (bans.NumberOfVACBans > 0) banstring += `✅ ${bans.NumberOfVACBans} VAC Ban${bans.NumberOfVACBans > 1 ? "s" : ""}\n`;
      else banstring += "❌ 0 VAC Bans\n";
      if (bans.NumberOfGameBans > 0) banstring += `✅ ${bans.NumberOfGameBans} Game Ban${bans.NumberOfGameBans > 1 ? "s" : ""}\n`;
      else banstring += "❌ 0 Game Bans\n";
      if (bans.EconomyBan !== "none") banstring += `✅ Trade ban status: ${bans.EconomyBan}\n`;
      else banstring += "❌ Not trade banned\n";
    }

    // Pushes the ban string
    if (banstring.length) fieldsConstruct.push({
      name: "Ban Status",
      value: banstring,
      inline: false,
    });

    // Sends the embed
    steamsg.edit({
      embed: {
        description: description,
        color: this.bot.embed.color("general"),
        fields: fieldsConstruct,
        author: {
          name: profile.personaname,
          icon_url: profile.avatarfull,
          url: `https://steamcommunity.com/profiles/${profile.steamid}`,
        },
        thumbnail: {
          url: profile.avatarfull,
        },
      },
    });
  }
}

module.exports = steamCommand;