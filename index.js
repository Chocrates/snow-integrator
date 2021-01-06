/*
 * This is the main entrypoint to your Probot app
 * @param { {app: import('probot').Application} } app
 */

const axios = require("axios").default;
const { SNOW_USER, SNOW_PASSWORD, SNOW_URL } = process.env;
module.exports = (app) => {
    app.log.info("Yay, the app was loaded!");

    app.on("installation", async (context) => {
        app.log.info("Installation event received!");
    });

    app.on(["issues.opened", "issues.edited"], async (context) => {
        const { url, body, title } = context.payload.issue;
        const user = context.payload.issue.user.login;
        app.log.info(`${context.payload.action}`);
        app.log.info(`Url: ${url} Body: ${body} Title: ${title} User: ${user}`);
        createOrUpdateIssueInSNOW({
            app,
            action: context.payload.action,
            context,
            url,
            title,
            body,
            user,
        });
    });

    app.on(
        ["issue_comment.created", "issue_comment.edited"],
        async (context) => {
            app.log.info(`${context.payload.action}`);

            const { url, body, title } = context.payload.issue;
            const user = context.payload.issue.user.login;
            const comment_url = context.payload.comment.url;
            const comment_user = context.payload.comment.user.login;
            const comment_body = context.payload.comment.body;

            if (context.payload.action === "edited") {
                const from = context.payload.changes.body.from;
                updateCommentInSNOW({
                    app,
                    context,
                    url,
                    title,
                    body,
                    user,
                    comment_url,
                    comment_user,
                    comment_body,
                    from,
                });
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
    );
};
const base64Encode = (str) => Buffer.from(str, "utf-8").toString("base64");

const createOrUpdateIssueInSNOW = async ({
    app,
    action,
    context,
    url,
    title,
    body,
    user,
}) => {
    app.log.info(`Create issue in SNOW`);
    let incident_number, sys_id;
    const rest_url = `${SNOW_URL}/api/now/table/incident`;
    const headers = {
        Authorization: `Basic ${base64Encode(`${SNOW_USER}:${SNOW_PASSWORD}`)}`,
    };

    try {
        if (action === "edited") {
            // get and strip json object from body
            [snow_data, body] = body.split("-->\r\n");
            snow_data = JSON.parse(snow_data.split("<!--")[1]);
            const description = `${body}\nGenerated from GitHub: ${url}`;
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
            const description = `${body}\nGenerated from GitHub: ${url}`;
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
    return context.octokit.issues.update(
        context.issue({
            body: `<!-- {"incident_number":"${incident_number}", "sys_id":"${sys_id}", "url":"${SNOW_URL}/nav_to.do?uri=/incident.do?sys_id=${sys_id}"} -->\r\n${body}`,
        })
    );
};

const updateIssueInSNOW = ({ app, context, url, title, body, user, from }) => {
    app.log.info(`Update issue in SNOW`);
    app.log.info(`${url} ${title} ${body} ${user} ${from}`);
};

const createCommentInSNOW = ({
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
};

const updateCommentInSNOW = ({
    app,
    context,
    url,
    title,
    body,
    user,
    comment_url,
    comment_user,
    comment_body,
    from,
}) => {
    app.log.info(`Update comment in SNOW`);
    app.log.info(
        `${url} ${title} ${body} ${user} ${comment_url} ${comment_user} ${comment_body} ${from}`
    );
};

// Gets all incidents?  Prolly paginated curl -H "Authorization: Basic $(echo -n admin:hKBjFd9JZh4m | base64)" https://dev64641.service-now.com/api/now/table/incident | jq '.result[0]'
// curl --user admin:hKBjFd9JZh4m --header "Content-Type:application/json" --header "Accept: application/json" --request POST --data '{"short_description": "Test with CURL"}' https://dev64641.service-now.com/api/now/table/incident
/* Result: {
    "result": {
        "parent": "",
        "made_sla": "true",
        "caused_by": "",
        "watch_list": "",
        "upon_reject": "cancel",
        "sys_updated_on": "2021-01-06 15:14:18",
        "child_incidents": "0",
        "hold_reason": "",
        "task_effective_number": "INC0010016",
        "approval_history": "",
        "number": "INC0010016",
        "resolved_by": "",
        "sys_updated_by": "admin",
        "opened_by": {
            "link": "https://dev64641.service-now.com/api/now/table/sys_user/6816f79cc0a8016401c5a33be04be441",
            "value": "6816f79cc0a8016401c5a33be04be441"
        },
        "user_input": "",
        "sys_created_on": "2021-01-06 15:14:18",
        "sys_domain": {
            "link": "https://dev64641.service-now.com/api/now/table/sys_user_group/global",
            "value": "global"
        },
        "state": "1",
        "route_reason": "",
        "sys_created_by": "admin",
        "knowledge": "false",
        "order": "",
        "calendar_stc": "",
        "closed_at": "",
        "cmdb_ci": "",
        "delivery_plan": "",
        "contract": "",
        "impact": "3",
        "active": "true",
        "work_notes_list": "",
        "business_service": "",
        "priority": "5",
        "sys_domain_path": "/",
        "rfc": "",
        "time_worked": "",
        "expected_start": "",
        "opened_at": "2021-01-06 15:14:18",
        "business_duration": "",
        "group_list": "",
        "work_end": "",
        "caller_id": "",
        "reopened_time": "",
        "resolved_at": "",
        "approval_set": "",
        "subcategory": "",
        "work_notes": "",
        "universal_request": "",
        "short_description": "Test with CURL",
        "close_code": "",
        "correlation_display": "",
        "delivery_task": "",
        "work_start": "",
        "assignment_group": "",
        "additional_assignee_list": "",
        "business_stc": "",
        "description": "",
        "calendar_duration": "",
        "close_notes": "",
        "notify": "1",
        "service_offering": "",
        "sys_class_name": "incident",
        "closed_by": "",
        "follow_up": "",
        "parent_incident": "",
        "sys_id": "aae8d9eddba920108cbf4870399619e4",
        "contact_type": "",
        "reopened_by": "",
        "incident_state": "1",
        "urgency": "3",
        "problem_id": "",
        "company": "",
        "reassignment_count": "0",
        "activity_due": "",
        "assigned_to": "",
        "severity": "3",
        "comments": "",
        "approval": "not requested",
        "sla_due": "",
        "comments_and_work_notes": "",
        "due_date": "",
        "sys_mod_count": "0",
        "reopen_count": "0",
        "sys_tags": "",
        "escalation": "0",
        "upon_approval": "proceed",
        "correlation_id": "",
        "location": "",
        "category": "inquiry"
    }
} */

// update: curl --user admin:hKBjFd9JZh4m --header "Content-Type:application/json" --header "Accept: application/json" --request PUT --data '{"short_description": "Test with CURL I AM AN UPDATE"}' https://dev64641.service-now.com/api/now/table/incident/aae8d9eddba920108cbf4870399619e4
