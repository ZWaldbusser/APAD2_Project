# Import necessary libraries and modules
from db import db as myDB
import hardwareDatabase

'''
Structure of Project entry:
Project = {
    'projectName': projectName,
    'projectId': projectId,
    'description': description,
    'hwSets': {HW1: 0, HW2: 10, ...},
    'users': [user1, user2, ...]
}
'''

def queryProject(projectId):
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)

    if cursor == None:
        print(f"Error: project '{projectId}' was not found")
        return None
    return cursor


def createProject(projectName, projectId, description):
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)
    if cursor == None:
        myDB["projects"].insert_one({
            'projectName': projectName,
            'projectId': projectId,
            'description': description,
            'hwSets': {},
            'users': []
        })
        return True
    else:
        print(f"Error: project '{projectId}' already exists")
        return False


def addUser(projectId, userId):
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)
    if cursor is None:
        print(f"Error: project '{projectId}' was not found")
        return "not_found"
    if userId in cursor.get("users", []):
        print(f"User '{userId}' already in project '{projectId}'.")
        return "already_member"
    myCol.update_one(
        {"projectId": projectId},
        {"$addToSet": {"users": userId}}
    )
    return "added"


def updateUsage(projectId, hwSetName, newUsage=0):
    if newUsage < 0:
        print(f"Error: usage for '{hwSetName}' cannot be negative")
        return False
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)
    if cursor == None:
        print(f"Error: project '{projectId}' was not found")
        return False
    result = myCol.update_one(
        {"projectId": projectId},
        {"$set": {f"hwSets.{hwSetName}": newUsage}}
    )

    return result.matched_count > 0


def checkOutHW(projectId, hwSetName, qty, userId):
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)
    if cursor == None:
        print(f"Error: project '{projectId}' was not found")
        return False
    myCol.update_one(
        {"projectId": projectId},
        {
            "$inc": {f"hwSets.{hwSetName}": qty},
            "$addToSet": {"users": userId}
        }

    )
    return True


def checkInHW(projectId, hwSetName, qty, userId):
    if qty <= 0:
        print(f"Error: quantity for check-in must be positive")
        return False
    myCol = myDB["projects"]
    myQuery = {'projectId': projectId}
    cursor = myCol.find_one(myQuery)
    if cursor == None:
        print(f"Error: project '{projectId}' was not found")
        return False
    current_usage = cursor.get("hwSets", {}).get(hwSetName, 0)
    if current_usage < qty:
        print(f"Error: not enough hardware checked out for '{hwSetName}'")
        return False
    result = myCol.update_one(
        {"projectId": projectId},
        {
            "$inc": {f"hwSets.{hwSetName}": -qty},
            "$addToSet": {"users": userId}
        }
    )
    return result.matched_count > 0