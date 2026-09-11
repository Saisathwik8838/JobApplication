/** @typedef {{id:string,company:string,title:string,location?:string,salary?:string,url:string,status:string,matches?:{result:{matchScore:number,explanation:string,missingSkills:string[]}}[],applications?:{id:string,status:string}[]}} Job */
/** @typedef {{id:string,status:string,job:Job,answers:{id:string,question:string,answer?:string,status:string}[],events:object[]}} Application */
export {};
