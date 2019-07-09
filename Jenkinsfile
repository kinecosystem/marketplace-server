// Important:
// Parameters expected from Jenkins job:
// 1. Marketplace server role (public/internal/admin)
// 2. Branch (default: master)
// 3. Environment (ci/qa/etc.)
// 4. Specific Version (Default: GitHub revision)
// 5. Num_of_instances to deploy
// 6.

pipeline {
    agent any
    environment {

        //Get AWS region
        //Assume Jenkins is running on the same region as the cluster
        REGION =  sh(script:'curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region', returnStdout: true)
        STELLAR_ADDRESS = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/STELLAR_ADDRESS | jq -r ".Parameter.Value")'
        STELLAR_BASE_SEED = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/STELLAR_BASE_SEED | jq -r ".Parameter.Value")'
        CLUSTER_URL = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/CLUSTER_URL | jq -r ".Parameter.Value")'
        //todo: if no version supplied - use default github revision for branch
        //GIT_REVISION = sh (script : 'git rev-parse --short HEAD', returnStdout: true).trim()

    }

    stages {
        stage('Checkout') {
            steps {
                  git(
                       url: 'https://github.com/kinecosystem/marketplace-server.git',
                       branch: "${BRANCH}"
                   )

            }
        }

//        stage('Create secrets for tests') {
//        // todo: should be on the test docker only?
//
//           steps {
//                echo 'Creating secrets for tests'
//                sh "mkdir -p ./secrets/ && echo export STELLAR_BASE_SEED=$STELLAR_BASE_SEED STELLAR_ADDRESS=$STELLAR_ADDRESS > ./secrets/.secrets"
//            }
//       }
//        // todo: only for tests?
//        stage('Create-jwt-keys') {
//            steps {
//                echo 'Creating local JWT keys'
//                sh 'make create-jwt-keys'
//            }
//       }
         stage ('Setup'){
            steps{
                script {
                    GIT_REVISION = sh (
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                }
                echo "Working on version: ${GIT_REVISION}"
                sh 'npm i'
                sh 'npm run transpile'
             }
         }
         stage ('Code Quality'){
         //Todo: Quality and security plugins (FindBugs, CheckMarx, etc.)
            parallel {


                stage('Unit Test') {
                    steps {
                        echo 'Unit testing'
                        //todo: 'add unit tests'
                    }
                }
                stage ('Code Coverage'){
                    steps {
                        echo "Running codecov"
                        //todo: consider using sonarcube in addition to codecov
                        sh './node_modules/codecov/bin/codecov'

                    }
                }
                stage('Create Docker Image') {
                    steps {
                        echo 'Creating docker image'
                        sh 'make build-image'
                    }
                }
            }
        }
        stage('Deploy to env') {
            steps {
                // get k8s environment
                script {
                    env['K8S_CLUSTER_URL'] = sh (
                            script: "echo $CLUSTER_URL",
                            returnStdout: true
                       ).trim()
                }
                echo "Deploying version $env.GIT_REVISION to env: $env.K8S_CLUSTER_URL"
                // Require to define the default2 (Kubernetes token) in Jenkins credentials
                withKubeConfig([credentialsId: 'default2',
                serverUrl: env.K8S_CLUSTER_URL,
                clusterName: 'test'
                ]) {
                    sh '''
                        #create namespace if doesn't exists
                        cat k8s/namespace.yaml | sed 's/__ENVIRONMENT'"/${Environment}/g" | kubectl apply -f - || true
                        GIT_REVISION=`git rev-parse --short HEAD`
                        SED_ARGS="s/__ENVIRONMENT/${Environment}/g; s/__SERVER_ROLE/${Role}/g; s/__VERSION/${GIT_REVISION}/g; s/__REPLICAS/${Num_of_instances}/g"
                        cat k8s/marketplace-deployment.yaml \
                          | sed  "${SED_ARGS}" \
                          | kubectl apply  -f -
                     '''
                    }

            }
        }
        stage('Integration/System tests') {
            steps {
                echo 'Running Integration/System tests'
                //Todo: Extract logs and tests results to jenkins
                //Todo: Make sure the job runs only once
                withKubeConfig([credentialsId: 'default2',
                serverUrl: env.K8S_CLUSTER_URL,
                clusterName: 'test'
                ]) {
                    sh '''
                        GIT_REVISION=`git rev-parse --short HEAD`
                        #create namespace if doesn't exists
                        cat k8s/namespace.yaml | sed 's/__ENVIRONMENT'"/${Environment}/g" | kubectl apply -f - || true
                        SED_ARGS="s/__ENVIRONMENT/${Environment}/g; s/__SERVER_ROLE/${Role}/g; s/__VERSION/${GIT_REVISION}/g; s/__DEBUG/False/g;"
                        cat k8s/marketplace-test-deployment.yaml \
                          | sed  "${SED_ARGS}" \
                          | kubectl apply  -f -
                     '''
                    }
            }
        }
        stage('Push Docker image') {
            steps {
                echo 'Pushing Docker image, version $env.GIT_REVISION to dockerhub'
                withDockerRegistry([ credentialsId: "dockerhub", url: "" ]) {
                    sh 'make push-image'
                }
                //todo: Repeat with latest tag on master only (make-push image always tags latest)?
            }
        }
    }
   // post {
   //    // only triggered when blue or green sign
   //    success {
   //        slackSend ( color: '#00FF00', message: "SUCCESSFUL: Docker image (${GIT_REVISION}) deployed to docker hub for  '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
   //    }
   //    // triggered when red sign
   //    failure {
   //        slackSend (color: '#FF0000', message: "FAILED: Docker image (${GIT_REVISION}) failure (creating or sending) '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
   //    }
   // }
}
