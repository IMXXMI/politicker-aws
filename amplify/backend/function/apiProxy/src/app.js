/*
Use the following code to retrieve configured secrets from SSM:

const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');

const client = new SSMClient();
const { Parameters } = await client.send(new GetParametersCommand({
  Names: ["twitter_bearer"].map(secretName => process.env[secretName]),
  WithDecryption: true,
}));

Parameters will be of the form { Name: 'secretName', Value: 'secretValue', ... }[]
*/
/*
Use the following code to retrieve configured secrets from SSM:

const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');

const client = new SSMClient();
const { Parameters } = await client.send(new GetParametersCommand({
  Names: ["twitter_bearer"].map(secretName => process.env[secretName]),
  WithDecryption: true,
}));

Parameters will be of the form { Name: 'secretName', Value: 'secretValue', ... }[]
*/
/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/


/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	API_POLITICKER_GRAPHQLAPIIDOUTPUT
	API_POLITICKER_GRAPHQLAPIENDPOINTOUTPUT
	API_POLITICKER_GRAPHQLAPIKEYOUTPUT
	GEOCODIO_API_KEY
	CONGRESS_API_KEY
Amplify Params - DO NOT EDIT */
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

const params = {
  Name: '/politicker/twitter-bearer',
  WithDecryption: true
};
const { Parameter } = await ssm.getParameter(params).promise();
const bearerToken = Parameter.Value;

const express = require('express')
const bodyParser = require('body-parser')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')

// declare a new express app
const app = express()
app.use(bodyParser.json())
app.use(awsServerlessExpressMiddleware.eventContext())

// Enable CORS for all methods
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  next()
});
const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const xRes = await fetch('https://api.twitter.com/2/tweets?...', {
  headers: { 'Authorization': `Bearer ${bearerToken}` }
});

exports.handler = async (event) => {
  const { httpMethod, path, queryStringParameters } = event;
  const { zip, type } = queryStringParameters || {};

  if (httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' };

  try {
    let data;
    if (type === 'reps') {
      const apiKey = process.env.GEOCODIO_API_KEY;
      const url = `https://api.geocod.io/v1.9/geocode?q=${zip}&fields=cd,stateleg&api_key=${apiKey}`;
      const res = await fetch(url);
      data = await res.json();
    } else if (type === 'bill') {
      const apiKey = process.env.CONGRESS_API_KEY;
      const congress = 118;
      const listRes = await fetch(`https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=1&congress=${congress}&format=json`);
      const listData = await listRes.json();
      const billId = listData.bills[0]?.billId || 'hr1-118';
      const detailRes = await fetch(`https://api.congress.gov/v3/bill/${billId}?api_key=${apiKey}&format=json`);
      data = await detailRes.json();
    } else if (type === 'twitter') {
      const params = {
        Name: '/politicker/twitter-bearer',
        WithDecryption: true
      };
      const { Parameter } = await ssm.getParameter(params).promise();
      const bearerToken = Parameter.Value;
      const xRes = await fetch(`https://api.twitter.com/2/users/by/username/${zip}/tweets?max_results=5&tweet.fields=created_at`, { // zip as username for test
        headers: { 'Authorization': `Bearer ${bearerToken}` }
      });
      data = await xRes.json();
    } else {
      return { statusCode: 400, body: 'Invalid type' };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Proxy failed' }) };
  }
};

/**********************
 * Example get method *
 **********************/

app.get('/item', function(req, res) {
  // Add your code here
  res.json({success: 'get call succeed!', url: req.url});
});

app.get('/item/*', function(req, res) {
  // Add your code here
  res.json({success: 'get call succeed!', url: req.url});
});

/****************************
* Example post method *
****************************/

app.post('/item', function(req, res) {
  // Add your code here
  res.json({success: 'post call succeed!', url: req.url, body: req.body})
});

app.post('/item/*', function(req, res) {
  // Add your code here
  res.json({success: 'post call succeed!', url: req.url, body: req.body})
});

/****************************
* Example put method *
****************************/

app.put('/item', function(req, res) {
  // Add your code here
  res.json({success: 'put call succeed!', url: req.url, body: req.body})
});

app.put('/item/*', function(req, res) {
  // Add your code here
  res.json({success: 'put call succeed!', url: req.url, body: req.body})
});

/****************************
* Example delete method *
****************************/

app.delete('/item', function(req, res) {
  // Add your code here
  res.json({success: 'delete call succeed!', url: req.url});
});

app.delete('/item/*', function(req, res) {
  // Add your code here
  res.json({success: 'delete call succeed!', url: req.url});
});

app.listen(3000, function() {
    console.log("App started")
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app
