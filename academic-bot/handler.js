const axios = require("axios");
const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const OpenAI = require("openai");

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
   
    const updateParams = {
      TableName: "course-details",
      Key: { userId: key },
      UpdateExpression:
        "set courseHistory = :n, courseName = :t, instructors = :ps, instructor = :p, courseCode = :c",
      ExpressionAttributeValues: {
        ":n": newItem.courseHistory,
        ":t": newItem.courseName,
        ":ps": newItem.instructors,
        ":p": newItem.instructor,
        ":c": newItem.courseCode
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

const read_s3=async(key)=>{
    const s3 = new AWS.S3({
      region:process.env.REGION_NAME
    });
    const data = await readJsonFromS3(s3,process.env.BUCKET_NAME,key);
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

  else if(intent_name == "instructorDetails")
  {
    try{
        const sessionId = event.sessionId;
        let item  = await readItem(sessionId);
        let courseHistory = [];
        let course_query = null;
        const courseSlot = event.sessionState.intent.slots.course;
        course_query = courseSlot?.value?.interpretedValue?normalize(courseSlot.value.interpretedValue):null;
        if(!course_query && item)
        {
            course_query = normalize(item.courseName);
            course_query = course_query?course_query:normalize(item.courseCode);

        }
        if(!course_query)
        {
          return ellicitSlotValue("course","Which course do you want instructor details about?","instructorDetails");
        }

        const data = await read_s3(process.env.KEY);
        let found = null;
        for(let course of data)
        {
          const code = normalize(course['course_code']);
          const name = normalize(course['course_name']);
          if(course_query === code || course_query === name)
          {
            found = course;
            break;
          }
        }
        if(found)
        {
          let output = `The instructors for the course ${found.course_name} are:\n`;
          let i = 1;
          for(let section of found.sections )
          {
            output+= `Instructor ${i}: ${section.Instructor}\n`;
            i++;
          }
          output += `IC of Course: ${found.IC}`;
          const message = output;
           let instructors = [];
        for(let section of found.sections)
        {
            const prof = section.Instructor;
            instructors.push(prof);
        }
        courseHistory.push(found.course_name);

        const newItem = {
          "courseName":found.course_name,
          "courseCode":found.course_code,
          "instructors":instructors,
          "instructor":found.IC,
          "courseHistory":courseHistory.slice(-10)
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
            intent: { name: "instructorDetails", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
        }
        else {
        const message = `❌ Sorry, ${course_query} does not appear to be offered this semester.`;
  
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "instructorDetails", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
      }
        
    }
    catch(error)
    {
         console.log(error);
      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "instructorDetails", state: "Failed" }
        },
        messages: [
          {
            contentType: "PlainText",
            content: "Sorry, I couldn’t fetch the instructor details. Please try again later."
          }
        ]
      };
      
    }
  }
  else if (intent_name == "creditDetails") {
  try {
    const sessionId = event.sessionId;
    let item = await readItem(sessionId);
    let course_query = null;
    let courseHistory = [];

    const courseSlot = event.sessionState.intent.slots.course;
    course_query = courseSlot?.value?.interpretedValue
      ? normalize(courseSlot.value.interpretedValue)
      : null;

    if (item) courseHistory = item.courseHistory;

    if (!course_query && item) {
      course_query = normalize(item.courseName);
      course_query = course_query ? course_query : normalize(item.courseCode);
    }

    if (!course_query) {
      return ellicitSlotValue(
        "course",
        "Which course do you want the credit details for?",
        "creditDetails"
      );
    }

    const data = await read_s3(process.env.KEY);

    let found = null;
    for (let course of data) {
      const code = normalize(course["course_code"]);
      const name = normalize(course["course_name"]);
      if (course_query === code || course_query === name) {
        found = course;
        break;
      }
    }

    if (found) {
      let output = `🎓 Credit details for ${found.course_name}:\n`;
      output += `Lecture: ${found.lecture_sections || 0}\n`;
      output += `Tutorial: ${found.tut_sections || 0}\n`;
      output += `Practical: ${found.practical_sections || 0}`;

      courseHistory.push(found.course_name);

      const newItem = {
        courseName: found.course_name,
        courseCode:found.course_code,
        instructors: found.sections.map(s => s.Instructor),
        instructor: found.IC,
        courseHistory: courseHistory.slice(-10)
      };

      if (item) {
        await updateItem(sessionId, newItem);
      } else {
        await addItem(sessionId, newItem);
      }

      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "creditDetails", state: "Fulfilled" }
        },
        messages: [{ contentType: "PlainText", content: output }]
      };
    } else {
      const message = `❌ Sorry, ${course_query} does not appear to be offered this semester.`;

      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "creditDetails", state: "Fulfilled" }
        },
        messages: [{ contentType: "PlainText", content: message }]
      };
    }
  } catch (error) {
    console.log(error);
    return {
      sessionState: {
        dialogAction: { type: "Close" },
        intent: { name: "creditDetails", state: "Failed" }
      },
      messages: [
        {
          contentType: "PlainText",
          content: "Sorry, I couldn’t fetch the credit details. Please try again later."
        }
      ]
    };
  }
}

  else if (intent_name == "examSchedule") {
  try {
    const sessionId = event.sessionId;
    let item = await readItem(sessionId);
    let course_query = null;
    let courseHistory = [];

    const courseSlot = event.sessionState.intent.slots.course;
    course_query = courseSlot?.value?.interpretedValue
      ? normalize(courseSlot.value.interpretedValue)
      : null;

    if (item) courseHistory = item.courseHistory;

    if (!course_query && item) {
      course_query = normalize(item.courseName);
      course_query = course_query ? course_query : normalize(item.courseCode);
    }

    if (!course_query) {
      return ellicitSlotValue(
        "course",
        "Which course do you want the exam schedule for?",
        "examSchedule"
      );
    }

    const data = await read_s3(process.env.KEY);

    let found = null;
    for (let course of data) {
      const code = normalize(course["course_code"]);
      const name = normalize(course["course_name"]);
      if (course_query === code || course_query === name) {
        found = course;
        break;
      }
    }

    if (found) {
      let output = `📅 Exam Schedule for ${found.course_name}:\n`;
      output += `Midsem: ${found.midsem || "Not announced"}\n`;
      output += `Compre: ${found.compre || "Not announced"}`;

      courseHistory.push(found.course_name);

      const newItem = {
        courseName: found.course_name,
        courseCode: found.course_code,
        instructors: found.sections.map(s => s.Instructor),
        instructor: found.IC,
        courseHistory: courseHistory.slice(-10)
      };

      if (item) {
        await updateItem(sessionId, newItem);
      } else {
        await addItem(sessionId, newItem);
      }

      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "examSchedule", state: "Fulfilled" }
        },
        messages: [{ contentType: "PlainText", content: output }]
      };
    } else {
      const message = `❌ Sorry, ${course_query} does not appear to be offered this semester.`;

      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "examSchedule", state: "Fulfilled" }
        },
        messages: [{ contentType: "PlainText", content: message }]
      };
    }
  } catch (error) {
    console.log(error);
    return {
      sessionState: {
        dialogAction: { type: "Close" },
        intent: { name: "examSchedule", state: "Failed" }
      },
      messages: [
        {
          contentType: "PlainText",
          content: "Sorry, I couldn’t fetch the exam schedule. Please try again later."
        }
      ]
    };
  }
}

  else if (intent_name == "CourseDetails") {
    try {

        const sessionId = event.sessionId;
        let item = await readItem(sessionId);
        let course_query = null;
        let courseHistory = [];
        const courseSlot = event.sessionState.intent.slots.course;
        course_query = courseSlot?.value?.interpretedValue
    ? normalize(courseSlot.value.interpretedValue)
    : null;
      if(item)
        courseHistory = item.courseHistory;
      if(!course_query && item)
        {
        
          course_query = normalize(item.courseName);
          course_query = course_query?course_query:normalize(item.courseCode);
        }
        
      if(!course_query)
        {
          return ellicitSlotValue("course","Which course are you asking about?","CourseDetails");
        }


      const data = await read_s3(process.env.KEY);  
  
      let found = null;
      for (let course of data) {
       
        const code = normalize(course['course_code']);
        const name = normalize(course['course_name']);
        if (course_query === code || course_query === name) {  
          found = course;
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
          "courseCode":found.course_code,
          "instructors":instructors,
          "instructor":found.IC,
          "courseHistory":courseHistory.slice(-10)
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
  else if(intent_name == 'clashCheck')
  {
    try{
          const courseSlot = event.sessionState.intent.slots.course1;
          const courseSlot2 = event.sessionState.intent.slots.course2;

          let course_query1 = courseSlot?.value?.interpretedValue?normalize(courseSlot.value.interpretedValue):null;

          let course_query2 = courseSlot2?.value?.interpretedValue?normalize(courseSlot2.value.interpretedValue):null;

          if(!course_query1)
          {
            return ellicitSlotValue("course1","Which course are you asking  about","clashCheck");

          }
          if(!course_query2)
          {
            return ellicitSlotValue("course2","Which course you want to check clash with","clashCheck");
          }
          
          const data = await read_s3(process.env.KEY);
          let found1 = null;
          let found2 = null;
              for (let course of data) {
                if(found1 && found2)
                    break;
        const code = normalize(course['course_code']);
        const name = normalize(course['course_name']);
        if (course_query1 === code || course_query1 === name) {  
          found1 = course;
         
        }

        if(course_query2 === code || course_query2 === name)
        {
          found2 = course;
        }
      }

          if (!found1 || !found2) {
      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "clashCheck", state: "Failed" }
        },
        messages: [
          {
            contentType: "PlainText",
            content: "❌ One or both of the courses were not found in the database."
          }
        ]
      };
        }
      let  scheduleOutput = [];
      let idx = 1;
      for(let section of found1.sections)
      {
        let timings1 = section.Days_Times;
        timings1 = new Set(timings1.map((dt)=>dt.trim().toUpperCase()));
        if(scheduleOutput.length >10)
            break;
        for(let section2 of found2.sections)
        {
          if(scheduleOutput.length >10)
            break;
          let timings2 = section2.Days_Times;
          timings2 = new Set(timings2.map((dt)=>dt.trim().toUpperCase()));

          const clash = [...timings1].some(slot=>timings2.has(slot));

          if(!clash)
          {
            let temp = `Schedule ${idx}:\n  • ${found1.course_name} (${section.section_name} by ${section.Instructor}) → ${section.Days_Times.join(", ")}\n  • ${found2.course_name} (${section2.section_name} by ${section2.Instructor}) → ${section2.Days_Times.join(", ")}`;
            idx++;
            scheduleOutput.push(temp);
          }
        }
      }

      if(scheduleOutput.length === 0)
      {
        const message = `❌ Sorry, ${found1.course_name || "Course1"} and ${found2.course_name || "Course2"} do not have a clash-free schedule.`;

  
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "clashCheck", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };

      }


   const message = `✅ Clash-free schedules found:\n\n${scheduleOutput.join("\n\n")}`;

return {
  sessionState: {
    dialogAction: { type: "Close" },
    intent: { name: "clashCheck", state: "Fulfilled" }
  },
  messages: [{ contentType: "PlainText", content: message }]
};
      

    }
    catch(error)
    {
      console.log("Error fetching schedules",error);
      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "clashCheck", state: "Failed" }
        },
        messages: [
          {
            contentType: "PlainText",
            content: "Sorry, I couldn’t fetch the schedules. Please try again later."
          }
        ]
      };

    }
  }
  else if(intent_name == 'profReviews')
  {
    try{
     const sessionId = event.sessionId;
        let item = await readItem(sessionId);
        let course_query = null;
        let courseHistory = [];
        const courseSlot = event.sessionState.intent.slots.course;
        course_query = courseSlot?.value?.interpretedValue
    ? normalize(courseSlot.value.interpretedValue)
    : null;

    const instructorSlot = event.sessionState.intent.slots.instructor;
        instructor_query = instructorSlot?.value?.interpretedValue
    ? normalize(instructorSlot.value.interpretedValue)
    : null;
      if(item)
        courseHistory = item.courseHistory;
      if(!course_query && item)
        {
        
          course_query = normalize(item.courseCode);
     
        }
        if(!instructor_query && item)
        {
          instructor_query = normalize(item.instructor);
        }

      if(!course_query)
        {
          return ellicitSlotValue("course","Which course are you asking about?","profReviews");
        }
      if(!instructor_query)
      {
        return ellicitSlotValue("instructor","Which instructor reviews do you want ?","profReviews")
      }

      const data = await read_s3(process.env.REVIEW_KEY);  
  
      let found = null;
      for (let course of Object.keys(data)) {
       
        const code = normalize(course);
        if (course_query === code) {  
          found = course;
          break;
        }
      }

      
      if (found) {
          let reviews = [];
          let professor = null;
          for(let prof of data[found])
        {
          if(normalize(prof.professor) == instructor_query)
          {
            professor = prof.professor;
            reviews.push(prof.comment);
          }

        }

        if(reviews.length === 0)
        {
            const message = `❌ Sorry, ${professor || "professor"} does not have feedback available.`;
  
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "profReviews", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };

        }

        const message = `✅ Reviews for ${professor || "this instructor"} in ${found}:\n\n` +
                    reviews.map((review, index) => `|Review ${index + 1}: ${review}`).join("\n");

        let instructors = [professor];
        courseHistory.push(found);

        const newItem = {
          "courseName":"",
          "courseCode":found,
          "instructors":instructors,
          "instructor":professor,
          "courseHistory":courseHistory.slice(-10)
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
            intent: { name: "profReviews", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
      } else {
        const message = `❌ Sorry, ${course_query} does not appear to be offered this semester.`;
  
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "profReviews", state: "Fulfilled" }
          },
          messages: [{ contentType: "PlainText", content: message }]
        };
      }
    } catch (error) {
      console.log(error);
      return {
        sessionState: {
          dialogAction: { type: "Close" },
          intent: { name: "profReviews", state: "Failed" }
        },
        messages: [
          {
            contentType: "PlainText",
            content: "Sorry, I couldn’t fetch the professor reviews. Please try again later."
          }
        ]
      };
    }

  }
  else if(intent_name == "courseHelp")
  {
      try{
                const clientgpt = new OpenAI({
                              apiKey:process.env.API_KEY
                            })
                const sessionId = event.sessionId;
              let item = await readItem(sessionId);
              let course_query = null;
              const courseSlot = event.sessionState.intent.slots.course;
              course_query = courseSlot?.value?.interpretedValue
          ? normalize(courseSlot.value.interpretedValue)
          : null;
           
            if(!course_query && item)
              {
              
                course_query = normalize(item.courseName);
          
              }
              
            if(!course_query)
              {
                return ellicitSlotValue("course","Which course are you asking about?","courseHelp");
              }

              const response = await clientgpt.chat.completions.create({
            model:"gpt-5",
            input:[{
              'role':'system',
              'content':"You are an academic registeration assistant, You provide usefulness and suggestions for better courses.Always try to give answers in bullet points. "

            },{
              'role':'user',
              'content':"Can you tell whether the course"+course_query+"is useful and either give better recommendations for other courses."
            }
            ]
          })
          const answer  = response.choices[0].message.content;
          return {
            sessionState: {
              dialogAction: { type: "Close" },
              intent: { name: "courseHelp", state: "Fulfilled" }
            },
            messages: [{ contentType: "PlainText", content: answer }]
          };
      }
      catch(error)
      {
        console.log("Error querying chatgpt"+error);
        return {
          sessionState: {
            dialogAction: { type: "Close" },
            intent: { name: "courseHelp", state: "Failed" }
          },
          messages: [
            {
              contentType: "PlainText",
              content: "Sorry, Error Querying GPT. Please try again later."
            }
          ]
        };
      }
  }
  
};
