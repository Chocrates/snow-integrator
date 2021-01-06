# snow-integrator

> A GitHub App built with [Probot](https://github.com/probot/probot) that A Probot app

snow-integrator listens for issue create or update events and creates or updates the corresponding issue in Service Now
It also will sync issue comments between service now work notes.  *Note:* Work notes in service now are not editable so edits are silently ignored

The above functionality is achieved through this probot app as well as a Business Rule and an Event in Service Now.  Details below in [Setup](#Setup)

## Current Capabilities:
- Create Service Now Incident when a GitHub issue has been created
- Create GitHub Issue when a Service Now incident has been created
- Sync GitHub comment with service now work notes on associated issues/incidents

## TODO:
- Fix attribution for Issues/Incidents and Comments/Work Notes
- Determine better way to configure for teams/repositories
- Find a better place for meta-data
  - Probably a db docker image in the short term
- Write tests for current logic
- Clean up the code

## Setup
### Probot Setup
```sh
# Install dependencies
npm install

# Run the bot
npm start
```

### Service Now Setup
- Register a new Event in Service Now
- Create a new `Script Action` triggered on your new event with the following code
```
var sys_id = event.parm1;
// Create a GlideRecord object  
var current = new GlideRecord('incident');

current.get(sys_id);

var post_request = {
    'event': 'created',
    'incident_number': current.getValue('number'),
    'short_description': current.getValue('short_description'),
    'description': current.getValue('description'),
    'sys_id': current.getValue('sys_id'),
	'work_notes': current.work_notes.getJournalEntry(1)
};

var restMessage = new sn_ws.RESTMessageV2();

restMessage.setHttpMethod("post");
restMessage.setEndpoint("<probot base url>:3000/service-now/<org>/<repo>/update");
restMessage.setRequestHeader('Content-Type', 'application/json');

restMessage.setRequestBody(JSON.stringify(
    post_request
));
var response = restMessage.execute();
var responseObj = JSON.parse(response.getBody());
var currentDescription = current.getValue('description');
if (!currentDescription.contains('<!-- { "isSnowIntegratorMetaData": "true"')) {
    current.setValue('description', '<!-- { "isSnowIntegratorMetaData": "true", "issue_number": "' + responseObj.issue_number + '"} -->\r\n' + current.getValue('description'));
}
current.update();
```
- Create a new Business Rule 
  - Before
  - On Insert and Update
  - Make sure to update the event name in the `gs.eventQueue` method call
```
(function executeRule(current, previous /*null when async*/ ) {
    if (gs.isInteractive()) {
        current.setWorkflow(false);
        gs.eventQueue('x_554302_githubeve.gh_update', current, current.getValue('sys_id'));
    } else {
        gs.info('Non interactive, skipping');
    }
})(current, previous);
```

## Docker

```sh
# 1. Build container
docker build -t snow-integrator .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> snow-integrator
```

## Contributing

If you have suggestions for how snow-integrator could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2020 Chris McIntosh <chocrates@github.com>
