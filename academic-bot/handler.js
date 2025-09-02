const axios = require("axios");
const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");

const addItem = async (sessionId,item) => {
  const ddb = new AWS.DynamoDB.DocumentClient();
  const params = {
    TableName: "course-details",
    Item: {
      userId:sessionId,
      ...item
    }
  };

  try {
    const data = await ddb.put(params).promise();
    console.log(`Success ${JSON.stringify(data, null, 2)}`);
    return data;
  } catch (err) {
    console.log(`Error Adding Item: ${JSON.stringify(err, null, 2)}`);
    throw err;
  }
};

const readItem=async(key)=>{
    const ddb = new AWS.DynamoDB.DocumentClient();
    var params = {
      TableName:"course-details",
      Key:{userId:key}
    }
   const data =  await ddb.get(params).promise();
   return data.Item;
}


const updateItem = async (key, newItem) => {
  const ddb = new AWS.DynamoDB.DocumentClient();

  try {
    // Step 1: Fetch existing item
    const getParams = {
      TableName: "course-details",
      Key: { userId: key }
    };

    const data = await ddb.get(getParams).promise();
    const item = data.Item || {};

    // Step 2: Update course history
    let courseHistory = item.courseHistory || [];
    if (item.courseName) {
      courseHistory.push(item.courseName);
    }

    // Keep only last 10 (if needed)
    courseHistory = courseHistory.slice(-10);

    // Step 3: Build update params
    const updateParams = {
      TableName: "course-details",
      Key: { userId: key },
      UpdateExpression:
        "set courseHistory = :n, courseName = :t, instructors = :ps, instructor = :p",
      ExpressionAttributeValues: {
        ":n": courseHistory,
        ":t": newItem.courseName,
        ":ps": newItem.instructors,
        ":p": newItem.instructor
      },
      ReturnValues: "UPDATED_NEW"
    };

    // Step 4: Execute update
    const result = await ddb.update(updateParams).promise();
    console.log("Updated successfully:", JSON.stringify(result, null, 2));
    return result;

  } catch (err) {
    console.error("Error updating item:", JSON.stringify(err, null, 2));
    throw err;
  }
};




function normalize(text){
    let normalizeText = text.replace(/[^A-Za-z0-9]/g,'');
     return normalizeText.toLowerCase();
}
async function readJsonFromS3(s3,bucketName,key){
  const params = {
    Bucket : bucketName,
    Key: key
  };

  try{
      const data = await s3.getObject(params).promise();
      const jsonString = data.Body.toString('utf-8');
      const jsonObject = JSON.parse(jsonString);
      return jsonObject;
  }
  catch(error)
  {
    console.log("Error reading S3 data "+error);
    throw error;
  }

}

const read_s3=async()=>{
    const s3 = new AWS.S3({
      region:process.env.REGION_NAME
    });
    const data = await readJsonFromS3(s3,process.env.BUCKET_NAME,process.env.KEY);
    return data;

}

const ellicitSlotValue = (slotToElicit, content, intent) => {
  return {
    sessionState: {
      dialogAction: {
        type: "ElicitSlot",
        slotToElicit: slotToElicit
      },
      intent: {
        name:intent,
        state:"InProgress"
      }
    },
    messages: [
      {
        contentType: "PlainText",
        content: content
      }
    ]
  };
};


exports.hello = async(event) => {
   
  const intent_name = event.sessionState.intent.name;
  if(intent_name == "greetUser")
  {

    const greetMessage = "Hi there! I'm your academic assistant for course registeration. I can help you check slot availability , give courses details ? What would you like help with today?"; 
  try{  
    return {
        "sessionState":{
          "dialogAction":{
            "type":"Close"
          },
          "intent":{
            "name":"greetUser",
            "state":"Fulfilled"
          }
          
        },
        "messages": [
            {
                "contentType": "PlainText",
                "content":greetMessage
                
            }
          
        ]
      }
    }
    catch(error)
    {
        console.log(error);
        return {
          "sessionState":{
            "dialogAction":{
              "type":"Close"
            },
            "intent":{
              "name":"greetUser",
              "state":"Failed"
            }

          },
          "messages": [
              {
                  "contentType": "PlainText",
                  "content":"Erorr greeting User!"

              }

          ]
        }
    }
  }
  else if (intent_name == "CourseDetails") {
    try {

        const sessionId = event.sessionId;
        const item = await readItem(sessionId);
        let course_query = null;
        let courseHistory = [];
        if(item)
        {
          course_query = normalize(item.courseName);
          courseHistory = item.courseHistory;
        }
        const courseSlot = event.sessionState.intent.slots.course;
        course_query = courseSlot?.value?.interpretedValue
    ? normalize(courseSlot.value.interpretedValue)
    : null;

        
        if(!course_query)
        {
          return ellicitSlotValue("course","Which course are you asking about?");
        }


      const data = await read_s3();  
  
      let found = null;
      console.log(`${course_query} Testing this`);
      for (let course of data) {
       
        const code = normalize(course['course_code']);
        const name = normalize(course['course_name']);
        if (course_query === code || course_query === name) {  
          found = course;
          console.log("Found");
          break;
        }
      }
  
      if (found) {
        const message = `✅ Yes, the course ${found['course_name']} (${found['course_code']}) is being offered. Would you like to know about the instructor, credits, exam dates, or schedule?`;
        
        let instructors = [];
        for(let section of found.sections)
        {
            const prof = section.Instructor;
            instructors.push(prof);
        }
        courseHistory.push(found.course_name);

        const newItem = {
          "courseName":found.course_name,
          "instructors":instructors,
          "instructor":found.IC,
          "courseHistory":courseHistory.slice(0,10)
        }
        if(item){
         await updateItem(sessionId,newItem);
        }
        else{
         await  addItem(sessionId,newItem);
        }
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "CourseDetails", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
      } else {
        const message = `❌ Sorry, ${course_query} does not appear to be offered this semester.`;
  
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "CourseDetails", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
      }
    } catch (error) {
      console.log(error);
      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "CourseDetails", state: "Failed" }
        },
        messages: [
          {
            contentType: "PlainText",
            content: "Sorry, I couldn’t fetch the course details. Please try again later."
          }
        ]
      };
    }
  }
  
};
