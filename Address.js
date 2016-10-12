'use strict';

console.log('Loading Address.js...');
const https = require('https');
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

function generateUUID() {
    var totalCharacters = 39; // length of number hash; in this case 0-39 = 40 characters
    var txtUuid = "";
    do {
        var point = Math.floor(Math.random() * 10);
        if (txtUuid.length === 0 && point === 0) {
            do {
                point = Math.floor(Math.random() * 10);
            } while (point === 0);
        }
        txtUuid = txtUuid + point;
    } while ((txtUuid.length - 1) < totalCharacters);
    return txtUuid;
}


exports.handler = function(event, context, callback) {
    console.log('handler event: ' + JSON.stringify(event));
    console.log('handler context: ' + JSON.stringify(context));
    
    var operation = event.operation;

    switch (operation) {
        case ('read'):
            getAddress(event, callback);
            break;
        case ('create'):
            createAddress(event, callback);
            break;
        case ('update'):
            updateAddress(event, callback);
            break;
        case ('delete'):
            deleteAddress(event, callback);
            break;
        default:
            var err = new Error('405 Invalid request method');
            err.name = 'Unrecognized operation "${event.operation}"';
            callback(err, null);
    }
};

function getAddress(event, callback) { 
    var params = {
        TableName: event.tableName,
        Key: {'UUID': event.UUID}
    };
    
    console.log('In getAddress, params is: ' + JSON.stringify(params));
    
    dynamo.getItem(params, function (err, data) {
       if (err) {
           console.log('getAddress err: ' + JSON.stringify(err));
           callback(err, null);
       } else if (Object.keys(data).length === 0) {
           err = new Error ('404 Resource not found');
           err.name = 'key not found in the table';
           callback(err, null);
       }
       else{
           console.log('getAddress success, data: ' + JSON.stringify(data));
           callback(null, data);
       }
    });
}

function hasAllAttributes(item) {
    // check whether the new Address has all four attributes city, number, street, state, and zipcode
    var obj = {'city': false, 'number': false, 'street': false, 'state': false, 'zipcode' : false};
    for (var key in item) {
        if (key in obj) obj[key] = true;
    }
    return obj.city && obj.number && obj.street && obj.state && obj.zipcode;
}

function getBarcode(item, callback) {
    // set auth-id and auth-token
    var id = '1a121d57-acec-669e-5f64-c413e1cd6fe2';
    var token = '0eBxLrzCLDYDZm77ilmL';
    var titleString = 'https://us-street.api.smartystreets.com/street-address?';
    var tileString  = "&'%20-H%20%22Content-Type:%20application/json";
    
    // check if the input item contains every field
    if (item.city === undefined || item.number === undefined || item.street === undefined
    || item.state === undefined || item.zipcode === undefined) {
        console.log('Lost some fields');
        callback(null);
    } else {
        // use SmartyStreet API and get the barcode from the response
        // create corresponding street string
        var streetArr = item.street.split(' ');
        var streetStr = '';
        for (var i in streetArr) {
            streetStr += streetArr[i] + '%20';
        }
        streetStr = streetStr.substring(0, streetStr.length-3);
        
        // create corresponding city string
        var cityArr = item.city.split(' ');
        var cityStr = '';
        for (var j in cityArr) {
            cityStr += cityArr[j] + '%20';
        }
        cityStr = cityStr.substring(0, cityStr.length-3);
        
        // create the url string
        var urlString = titleString + "auth-id=" + id + "&auth-token=" + token
                        + "&street=" + item.number + "%20" + streetStr + "&city="
                        + cityStr + "&state=" + item.state + tileString;
        
        var barcode;
        https.get(urlString, function(res) {
            console.log("Got response: " + res.statusCode);
            res.on('data', function(d) {
                process.stdout.write(d);
                console.log('data: ' + d);
                var obj = JSON.parse(d);
                if (obj[0] === undefined || obj[0]["delivery_point_barcode"] === undefined) barcode = null;
                else barcode = obj[0]["delivery_point_barcode"];
                console.log('code: ' + barcode);
                callback(barcode);
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
            callback(null);
        });
    }
}

function validateAddress(item, create, callback) {
    var err = null;
    if (create) {
        if (!hasAllAttributes(item)) {
            err = new Error('400 Invalid parameter');
            err.name = 'newAddress does not have enough attributes';
            callback(err);
        }
    } 
    for (var col in item) {
        switch (col) {
            case ('city'):
                if (typeof item.city != 'string') {
                    err = new Error('400 Invalid parameter');
                    err.name = 'wrong type! city has to be a Js string type';
                    callback(err);
                }
                break;
            case ('street'):
                if (typeof item.street != 'string') { 
                    err = new Error('400 Invalid parameter');
                    err.name = 'wrong type! street has to be a Js string type';
                    callback(err);
                }
                break;
            case ('number'):
                if (typeof item.number != 'string') {
                    err = new Error('400 Invalid parameter');
                    err.name = 'wrong type! number has to be a Js string type';
                    callback(err);
                } else {
                    var isNum = /^\d+$/.test(item.number);
                    if(!isNum){
                        err = new Error('400 Invalid parameter');
                        err.name = 'wrong type! street number has to be a real number';
                        callback(err);
                    }
                }
                break;
            case ('state'):
                if (typeof item.state != 'string') { 
                    err = new Error('400 Invalid parameter');
                    err.name = 'wrong type! state has to be a Js string type';
                    callback(err);
                }
                break;
            case ('zipcode'):
                if (typeof item.zipcode != 'string') {
                    err = new Error('400 Invalid parameter'); 
                    err.name = 'wrong type! zip code has to be a Js string type';
                    callback(err);
                }
                var re = /\d{5}/;
                if (!re.test(item.zipcode)) {
                    err = new Error('400 Invalid parameter');
                    err.name = 'zip code has to be a 5-digits number';
                    callback(err);
                }
                break;
            default:
               err = new Error('400 Invalid parameter');
               err.name = 'add cannot have additional fields';
               callback(err);
        }
    }
    getBarcode(item, function(barcode) {
        if (barcode === null) {
            callback(new Error('400 Invalid address'));
        } else {
            callback(barcode);
        }
    });
}

function createAddress(event, callback) {
    var params = {
        TableName: event.tableName,
        Item: event.item,
        ConditionExpression: "attribute_not_exists(#myid)",
        ExpressionAttributeNames: {"#myid": "UUID"}
    };

    console.log('In createAddress, params is: ' + JSON.stringify(params));

    //var barcode = validateAddress(params.Item, true);
    validateAddress(params.Item, true, function(barcode) {
        if (typeof barcode == 'object') {
            // we got an error object
            var err = barcode;
            console.log('validateAddress() returns err: ' + JSON.stringify(err));
            callback(err, null);
        } else {
            params.Item.UUID = barcode; 
            dynamo.putItem(params, function(err, data) {
                // Return OK and the UUID when address is already in table
                if (err && err.code != "ConditionalCheckFailedException") {
                    console.log('createAddress err: ' + JSON.stringify(err));
                    callback(err, null);
                } else {
                    if (err) {
                        // err.code == "ConditionalCheckFailedException"
                        console.log('createAddress: UUID conflict, treat it as successful creation');
                    }
                    else {
                        console.log('createAddress success, data: ' + JSON.stringify(data));
                    }
                    data['UUID'] = barcode;
                    callback(null, data);
                }
            });
        }
    });
}

function updateExpression(updates, params) {
    var expr = " SET";
    var exprAttrName = params.ExpressionAttributeNames;
    var exprAttrVal = params.ExpressionAttributeValues;

    for (var key in updates) {
        var attrKey = "#" + key;
        var attrVal = ":" + key;
        expr += " " + attrKey + " = " + attrVal + ",";
        exprAttrName[attrKey] = key;
        exprAttrVal[attrVal] = updates[key];
    }
    expr = expr.slice(0, -1);

    console.log("Translated expr in updateExpression: " + expr);
    console.log("Translated exprAttrName in updateExpression: " + JSON.stringify(exprAttrName));
    console.log("Translated exprAttrVal in updateExpression: " + JSON.stringify(exprAttrVal));

    params.UpdateExpression += expr;

    return params;
}

function __doUpdateAddress(event, callback) {
    var params = {
        TableName: event.tableName,
        Key: {'UUID': event.UUID},
        ConditionExpression: "attribute_exists(#myid)",
        UpdateExpression: "",
        ExpressionAttributeNames: {"#myid": "UUID"},
        ExpressionAttributeValues: {}
    };

    console.log('In __doUpdateAddress, params is: ' + JSON.stringify(params));
    
    //var barcode = validateAddress(event.updates, true);
    validateAddress(event.updates, true, function(barcode) {
        if (typeof barcode == 'object') {
            // we got an error object
            var err = barcode;
            console.log('validateAddress() returns err: ' + JSON.stringify(err));
            callback(err, null);
        } else {
            // Primary key cannot be modified
            //event.updates.UUID = barcode;
            params = updateExpression(event.updates, params);
            dynamo.updateItem(params, function(err, data) {
                if (err && err.code == "ConditionalCheckFailedException") {
                    err = new Error('404 Resource not found');
                    err.name = "Updating address is not found in the table";
                    console.log('updateAddress err: ' + JSON.stringify(err));
                    callback(err, null);
                } else if (err) {
                    console.log('updateAddress err: ' + JSON.stringify(err));
                    callback(err, null);
                } else {
                    console.log('updateAddress success, data: ' + JSON.stringify(data));
                    callback(null, data);
                }
            });
        }
    });
}

function updateAddress(event, callback) {
    if (!hasAllAttributes(event.updates)) {
        // if event.updates is lack of some attributes, patch it for verifying the address
        getAddress({tableName: event.tableName, UUID: event.UUID}, function (err, data) { 
            if (err) {
                console.log('updateAddress err: getAddress failed- ' + JSON.stringify(err));
                callback(err, null);
            } 
            // patch missed fields by its original values
            for (var key in data.Item) {
                if (!(key in event.updates) && key != 'UUID') {
                    event.updates[key] = data.Item[key];
                }
            }
            console.log('updateAddress: patched updates- ' + JSON.stringify(event.updates));
            __doUpdateAddress(event, callback);
        });
    } 
    else {
        __doUpdateAddress(event, callback);
    }
}

function deleteAddress(event, callback) {
    var params = {
        TableName: event.tableName,
        Key: {'UUID': event.UUID},
        ConditionExpression: "attribute_exists(#myid)",
        ExpressionAttributeNames: {"#myid": "UUID"}
    };
    
    console.log('In deleteAddress, params is: ' + JSON.stringify(params));
    
    dynamo.deleteItem(params, function(err, data) {
        if (err && err.code == "ConditionalCheckFailedException") {
            err = new Error('404 Resource not found');
            err.name = "Deleting address is not found in the table";
            console.log('deleteAddress err: ' + JSON.stringify(err));
            callback(err, null);
        } else if (err) {
            console.log('deleteAddress err: ' + JSON.stringify(err));
            callback(err, null);
        } else {
            console.log('deleteAddress complete, data: ' + JSON.stringify(data));
            callback(null, data);
        }
    });
}
