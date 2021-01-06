const axios = require("axios").default;
const bodyParser = require("body-parser");
const { SNOW_USER, SNOW_PASSWORD, SNOW_URL } = process.env;

module.exports = (app, { getRouter }) => {
    const router = getRouter("/service-now");
    router.use(require("express").static("public"));
    router.use(bodyParser.json());

    app.log.info("Yay, the app was loaded!");

    app.on("installation", async (context) => {
        app.log.info("Installation event received!");
    });

    app.on(["issues.opened", "issues.edited"], async (context) => {
        const { url, body, title, number } = context.payload.issue;
        const sender = context.payload.sender.login;
        const user = context.payload.issue.user.login;
        app.log.info(sender);
        // if a bot did NOT make this event
        if (!sender.includes("[bot]")) {
            app.log.info("Am I updating?");
            createOrUpdateIssueInSNOW({
                app,
                action: context.payload.action,
                context,
                url,
                title,
                body,
                user,
                issue_number: number,
            });
        }
    });

    app.on(
        ["issue_comment.created", "issue_comment.edited"],
        async (context) => {
            const { url, body, title } = context.payload.issue;
            const user = context.payload.issue.user.login;
            const sender = context.payload.sender.login;
            const comment_url = context.payload.comment.url;
            const comment_user = context.payload.comment.user.login;
            const comment_body = context.payload.comment.body;

            // if a bot did NOT make this event
            if (!sender.includes("[bot]")) {
                if (context.payload.action === "edited") {
                    app.log.info("Cannot update work notes in Service Now");
                } else {
                    createCommentInSNOW({
                        app,
                        context,
                        url,
                        title,
                        body,
                        user,
                        comment_url,
                        comment_user,
                        comment_body,
                    });
                }
            }
        }
    );

    router.post("/:owner/:repo/update", async (req, res) => {
        const { owner, repo } = req.params;
        const appOctokit = await app.auth();
        const response = await appOctokit.request(
            "GET /repos/{owner}/{repo}/installation",
            {
                owner,
                repo,
            }
        );

        const installationOctokit = await app.auth(response.data.id);
        let body, meta_data, issue_number;
        const {
            incident_number,
            short_description,
            description,
            sys_id,
            user,
            work_notes,
        } = req.body;
        app.log.info(`Request: ${JSON.stringify(req.body)}`);

        if (hasMetaData(description)) {
            [meta_data, body] = getMetaData(description);
            // strip SNOW metadata and replace with GitHub Metaadata
            body = `<!-- { "isSnowIntegratorMetaData": "true", "incident_number":"${incident_number}", "sys_id":"${sys_id}", "url":"${SNOW_URL}/nav_to.do?uri=/incident.do?sys_id=${sys_id}"} -->\r\n${body}`;
            let response = await installationOctokit.issues.update({
                owner,
                repo,
                issue_number: meta_data.issue_number,
                title: short_description,
                body,
            });
            issue_number = response.data.number;
        } else {
            body = `<!-- { "isSnowIntegratorMetaData": "true", "incident_number":"${incident_number}", "sys_id":"${sys_id}", "url":"${SNOW_URL}/nav_to.do?uri=/incident.do?sys_id=${sys_id}"} -->\r\n${description}`;
            let response = await installationOctokit.issues.create({
                owner,
                repo,
                title: short_description,
                body,
            });
            issue_number = response.data.number;
            const url = response.data.url;
        }

        // Update Work Notes if needed
        app.log.info(`Work Notes: ${work_notes}`);
        if (work_notes) {
            installationOctokit.issues.createComment({
                owner,
                repo,
                issue_number,
                body: `<!-- {"sys_id":"${sys_id}" -->\r\n${work_notes}`,
            });
        }
        app.log.info(
            `{ "isSnowIntegratorMetaDta": "true", "issue_number": "${issue_number}" }`
        );

        res.send(
            `{ "isSnowIntegratorMetaDta": "true", "issue_number": "${issue_number}" }`
        );
    });
};

const base64Encode = (str) => Buffer.from(str, "utf-8").toString("base64");

const hasMetaData = (str) =>
    str.includes('<!-- { "isSnowIntegratorMetaData": "true"');

const getMetaData = (body) => {
    [meta_data, body] = body.split("-->\r\n");
    meta_data = JSON.parse(meta_data.split("<!--")[1]);
    return [meta_data, body];
};

const createOrUpdateIssueInSNOW = async ({
    app,
    action,
    context,
    url,
    title,
    body,
    user,
    issue_number,
    issue_url,
}) => {
    app.log.info(`Create or update issue in SNOW`);
    let incident_number, sys_id;
    const rest_url = `${SNOW_URL}/api/now/table/incident`;
    const headers = {
        Authorization: `Basic ${base64Encode(`${SNOW_USER}:${SNOW_PASSWORD}`)}`,
    };

    try {
        app.log.info(action);
        app.log.info(body);
        app.log.info(`has Meta data: ${hasMetaData(body)}`);
        if (hasMetaData(body)) {
            // get and strip json object from body
            [snow_data, body] = getMetaData(body);
            const metaDataHeader = `<!-- { "isSnowIntegratorMetaData": "true", "issue_number": "${issue_number}", "url": "${url}" } -->`;
            const description = `${metaDataHeader}\r\n${body}\r\nGenerated from GitHub: ${url} by ${user}`;
            const response = await axios.put(
                `${rest_url}/${snow_data.sys_id}`,
                { short_description: title, description: description },
                { headers: headers }
            );
            incident_number = response.data["result"]["number"];
            sys_id = response.data["result"]["sys_id"];
            app.log.info(
                `Incident Updated: ${incident_number} System Id: ${sys_id}`
            );
        } else {
            const metaDataHeader = `<!-- { "isSnowIntegratorMetaData": "true", "issue_number": "${issue_number}", "url": "${url}" } -->`;
            const description = `${metaDataHeader}\r\n${body}`;
            const response = await axios.post(
                rest_url,
                {
                    short_description: title,
                    description: description,
                },
                {
                    headers: headers,
                }
            );
            incident_number = response.data["result"]["number"];
            sys_id = response.data["result"]["sys_id"];
            app.log.info(
                `Incident Created: ${incident_number} System Id: ${sys_id}`
            );
        }
    } catch (e) {
        app.log.error(e);
    }

    // update issue with incident number and URL
    // if we really want we could only do this if the meta data changes (or doesn't exist) in github
    if (hasMetaData(body)) {
        [snow_data, body] = getMetaData(body);
    }
    context.octokit.issues.update(
        context.issue({
            body: `<!-- { "isSnowIntegratorMetaData": "true", "incident_number":"${incident_number}", "sys_id":"${sys_id}", "url":"${SNOW_URL}/nav_to.do?uri=/incident.do?sys_id=${sys_id}"} -->\r\n${body}`,
        })
    );
};

const createCommentInSNOW = async ({
    app,
    context,
    url,
    title,
    body,
    user,
    comment_url,
    comment_user,
    comment_body,
}) => {
    app.log.info(`Create comment in SNOW`);
    app.log.info(
        `${url} ${title} ${body} ${user} ${comment_url} ${comment_user} ${comment_body}`
    );
    let incident_number, sys_id;
    const rest_url = `${SNOW_URL}/api/now/table/incident`;
    const headers = {
        Authorization: `Basic ${base64Encode(`${SNOW_USER}:${SNOW_PASSWORD}`)}`,
    };

    [snow_data, body] = body.split("-->\r\n");
    snow_data = JSON.parse(snow_data.split("<!--")[1]);
    const response = await axios.put(
        `${rest_url}/${snow_data.sys_id}`,
        {
            work_notes: `${comment_body}`,
        },
        { headers: headers }
    );
    sys_id = response.data["result"]["sys_id"];
    context.octokit.issues.updateComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        comment_id: context.payload.comment.id,
        body: `<!-- {"sys_id":"${sys_id}" -->\r\n${comment_body}`,
    });
};
