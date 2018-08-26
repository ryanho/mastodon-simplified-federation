// https://regex101.com/r/eKt3Fm/2
const REMOTE_FOLLOW_REGEX = /\/users\/(.+)\/remote_follow\/?$/;
// https://regex101.com/r/kyjiHj/2
const REMOTE_INTERACT_REGEX = /\/interact\/(\d+)\/?$/;

import * as mastodon from "/common/modules/mastodon.js";

const MASTODON_INTERACTION_TYPE = Object.freeze({
    FOLLOW: Symbol("mastodon remote follow"),
    TOOT_INTERACT: Symbol("mastodon remote toot interact")
});

/**
 * Saves the information about the parent tab and their state.
 *
 * @function
 * @private
 * @param {integer} tabId
 * @param {Object} changeInfo
 * @returns {Promise}
 */
function handleTabUpdate(tabId, changeInfo) {
    // ignore when URL is not changed
    if (!changeInfo.url) {
        return Promise.reject(new Error("URL info not available"));
    }

    const url = new URL(changeInfo.url);

    const mastodonInteraction = getMastodonInteractionType(url);

    // ignore non-Mastodon URLs
    switch (mastodonInteraction) {
    case null:
        return Promise.resolve();

    case MASTODON_INTERACTION_TYPE.TOOT_INTERACT:
        // verify it is really Mastodon first
        return redirectToot(url);

    case MASTODON_INTERACTION_TYPE.FOLLOW:
        return redirectFollow(url);

    default:
        throw new Error(`unknown interaction type: ${mastodonInteraction.toString()}`);
    }
}


/**
 * Fiund the follow URL.
 *
 * Rejects, if it is not Mastodon.
 *
 * @function
 * @private
 * @returns {Promise}
 */
function getFollowUrl() {
    // default = current tab
    return browser.tabs.executeScript(
        {
            file: "/content_script/findTootUrl.js",
            runAt: "document_end"
        }
    ).then((followUrl) => {
        if (!followUrl) {
            return Promise.reject(new Error("not Mastodon"));
        }

        return followUrl[0]; // I have no idea, why it is an array, here.
    });
}

/**
 * Redirects to a API endpoint of Mastodon for remote following.
 *
 * @function
 * @private
 * @param {string} uri a Mastodon hanlde (user account) to follow or toot URL
 * @returns {Promise}
 */
async function triggerRemoteAction(uri) {
    const handleObject = await browser.storage.sync.get("insertHandle");

    const ownMastodon = mastodon.splitUserHandle(handleObject.insertHandle);
    const mastodonApiUrl = await mastodon.getSubscribeApiUrl(ownMastodon, uri);

    // construct new URL and redirect
    return browser.tabs.update({
        loadReplace: true,
        url: (new URL(mastodonApiUrl)).toString()
    });
}

/**
 * Checks what type of interaction the current URL denotes.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {MASTODON_INTERACTION_TYPE|null}
 */
function getMastodonInteractionType(url) {
    if (url.pathname.match(REMOTE_FOLLOW_REGEX)) {
        return MASTODON_INTERACTION_TYPE.FOLLOW;
    }

    if (url.pathname.match(REMOTE_INTERACT_REGEX)) {
        return MASTODON_INTERACTION_TYPE.TOOT_INTERACT;
    }

    return null;
}

/**
 * Checks what type of interaction the current URL denotes.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {Promise}
 */
async function redirectToot(url) {
    const tootUrl = await getFollowUrl();

    // Redirect remote_follow page to own instance directly
    const tootId = getTootId(url);
    if (!tootUrl.includes(tootId)) {
        throw new Error("Toot ID is not included in toot URL.");
    }

    return triggerRemoteAction(tootUrl);
}

/**
 * Checks what type of interaction the current URL denotes.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {Promise}
 */
function redirectFollow(url) {
    // Redirect remote_follow page to own instance directly
    const remoteUser = getUsername(url);
    if (!remoteUser) {
        throw new Error("Could not get remote from for Mastodon page.");
    }

    const remoteServer = url.host;
    return triggerRemoteAction(`${remoteUser}@${remoteServer}`);
}

/**
 * Returns the username of the given remote_follow page.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {string|undefined}
 */
function getUsername(url) {
    const match = REMOTE_FOLLOW_REGEX.exec(url.pathname);
    return match[1];
}

/**
 * Returns the toot ID of the given interact page.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {string|undefined}
 */
function getTootId(url) {
    const match = REMOTE_INTERACT_REGEX.exec(url.pathname);
    return match[1];
}

/**
 * Init AutoRemoteFollower module.
 *
 * @function
 * @returns {Promise}
 */
function init() {
    browser.tabs.onUpdated.addListener(handleTabUpdate);
}

init();
